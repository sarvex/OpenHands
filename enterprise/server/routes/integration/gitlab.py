import hashlib
import json

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from integrations.gitlab.gitlab_manager import GitlabManager
from integrations.models import Message, SourceType
from server.auth.saas_user_auth import SaasUserAuth
from server.auth.token_manager import TokenManager
from storage.gitlab_webhook_store import GitlabWebhookStore

from openhands.core.logger import openhands_logger as logger
from openhands.server.shared import sio
from openhands.server.user_auth.user_auth import get_user_auth

gitlab_integration_router = APIRouter(prefix='/integration')
webhook_store = GitlabWebhookStore()

token_manager = TokenManager()
gitlab_manager = GitlabManager(token_manager)


async def verify_gitlab_signature(
    header_webhook_secret: str, webhook_uuid: str, user_id: str
):
    if not header_webhook_secret or not webhook_uuid or not user_id:
        raise HTTPException(status_code=403, detail='Required payload headers missing!')

    webhook_secret = await webhook_store.get_webhook_secret(
        webhook_uuid=webhook_uuid, user_id=user_id
    )

    if header_webhook_secret != webhook_secret:
        raise HTTPException(status_code=403, detail="Request signatures didn't match!")


@gitlab_integration_router.post('/gitlab/events')
async def gitlab_events(
    request: Request,
    x_gitlab_token: str = Header(None),
    x_openhands_webhook_id: str = Header(None),
    x_openhands_user_id: str = Header(None),
):
    try:
        await verify_gitlab_signature(
            header_webhook_secret=x_gitlab_token,
            webhook_uuid=x_openhands_webhook_id,
            user_id=x_openhands_user_id,
        )

        payload_data = await request.json()
        object_attributes = payload_data.get('object_attributes', {})
        dedup_key = object_attributes.get('id')

        if not dedup_key:
            # Hash entire payload if payload doesn't contain payload ID
            dedup_json = json.dumps(payload_data, sort_keys=True)
            dedup_hash = hashlib.sha256(dedup_json.encode()).hexdigest()
            dedup_key = f'gitlab_msg: {dedup_hash}'

        redis = sio.manager.redis
        created = await redis.set(dedup_key, 1, nx=True, ex=60)
        if not created:
            logger.info('gitlab_is_duplicate')
            return JSONResponse(
                status_code=200,
                content={'message': 'Duplicate GitLab event ignored.'},
            )

        message = Message(
            source=SourceType.GITLAB,
            message={
                'payload': payload_data,
                'installation_id': x_openhands_webhook_id,
            },
        )

        await gitlab_manager.receive_message(message)

        return JSONResponse(
            status_code=200,
            content={'message': 'GitLab events endpoint reached successfully.'},
        )

    except Exception as e:
        logger.exception(f'Error processing GitLab event: {e}')
        return JSONResponse(status_code=400, content={'error': 'Invalid payload.'})


@gitlab_integration_router.post('/gitlab/reinstall-webhook')
async def reinstall_gitlab_webhook(request: Request):
    """Mark the GitLab webhook for the current user for reinstallation.

    This endpoint marks the webhook for the user by setting webhook_exists=False,
    which will cause the cron job to reinstall it on the next run.
    """
    try:
        user_auth: SaasUserAuth = await get_user_auth(request)
        user_id = await user_auth.get_user_id()

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='User not authenticated',
            )

        webhook_marked = await webhook_store.mark_webhook_for_reinstallation(user_id)

        logger.info(
            'GitLab webhook marked for reinstallation',
            extra={
                'user_id': user_id,
                'webhook_marked': webhook_marked,
            },
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                'message': 'Webhook marked for reinstallation',
                'webhook_marked': webhook_marked,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f'Error marking GitLab webhook for reinstallation: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to mark webhook for reinstallation',
        )
