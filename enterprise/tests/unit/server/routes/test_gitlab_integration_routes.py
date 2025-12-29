"""Unit tests for GitLab integration routes."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from server.auth.saas_user_auth import SaasUserAuth
from server.routes.integration.gitlab import reinstall_gitlab_webhook


@pytest.fixture
def mock_request():
    """Create a mock FastAPI Request."""
    req = MagicMock(spec=Request)
    req.headers = {}
    req.cookies = {}
    return req


@pytest.fixture
def mock_user_auth():
    """Create a mock SaasUserAuth instance."""
    auth = AsyncMock(spec=SaasUserAuth)
    auth.get_user_id = AsyncMock(return_value='test_user_id')
    return auth


class TestReinstallGitLabWebhook:
    """Test cases for reinstall_gitlab_webhook endpoint."""

    @pytest.mark.asyncio
    @patch('server.routes.integration.gitlab.get_user_auth')
    @patch('server.routes.integration.gitlab.webhook_store')
    async def test_reinstall_webhook_success(
        self, mock_webhook_store, mock_get_auth, mock_request, mock_user_auth
    ):
        """Test successful webhook reinstallation request."""
        # Arrange
        mock_get_auth.return_value = mock_user_auth
        mock_webhook_store.mark_webhook_for_reinstallation = AsyncMock(return_value=5)

        # Act
        response = await reinstall_gitlab_webhook(mock_request)

        # Assert
        assert isinstance(response, JSONResponse)
        assert response.status_code == status.HTTP_200_OK

        body = json.loads(response.body.decode('utf-8'))
        assert body['message'] == 'Webhook marked for reinstallation'
        assert body['webhook_marked'] == 5

        mock_get_auth.assert_called_once_with(mock_request)
        mock_user_auth.get_user_id.assert_called_once()
        mock_webhook_store.mark_webhook_for_reinstallation.assert_called_once_with(
            'test_user_id'
        )

    @pytest.mark.asyncio
    @patch('server.routes.integration.gitlab.get_user_auth')
    @patch('server.routes.integration.gitlab.webhook_store')
    async def test_reinstall_webhook_no_webhooks_found(
        self, mock_webhook_store, mock_get_auth, mock_request, mock_user_auth
    ):
        """Test reinstallation when user has no webhooks."""
        # Arrange
        mock_get_auth.return_value = mock_user_auth
        mock_webhook_store.mark_webhook_for_reinstallation = AsyncMock(return_value=0)

        # Act
        response = await reinstall_gitlab_webhook(mock_request)

        # Assert
        assert isinstance(response, JSONResponse)
        assert response.status_code == status.HTTP_200_OK

        body = json.loads(response.body.decode('utf-8'))
        assert body['webhook_marked'] == 0

    @pytest.mark.asyncio
    @patch('server.routes.integration.gitlab.get_user_auth')
    async def test_reinstall_webhook_user_not_authenticated(
        self, mock_get_auth, mock_request, mock_user_auth
    ):
        """Test reinstallation when user is not authenticated."""
        # Arrange
        mock_get_auth.return_value = mock_user_auth
        mock_user_auth.get_user_id.return_value = None

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await reinstall_gitlab_webhook(mock_request)

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert exc_info.value.detail == 'User not authenticated'

    @pytest.mark.asyncio
    @patch('server.routes.integration.gitlab.get_user_auth')
    async def test_reinstall_webhook_authentication_failure(
        self, mock_get_auth, mock_request
    ):
        """Test reinstallation when authentication fails."""
        # Arrange
        mock_get_auth.side_effect = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail='Unauthorized'
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await reinstall_gitlab_webhook(mock_request)

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    @patch('server.routes.integration.gitlab.get_user_auth')
    @patch('server.routes.integration.gitlab.webhook_store')
    async def test_reinstall_webhook_database_error(
        self, mock_webhook_store, mock_get_auth, mock_request, mock_user_auth
    ):
        """Test reinstallation when database operation fails."""
        # Arrange
        mock_get_auth.return_value = mock_user_auth
        mock_webhook_store.mark_webhook_for_reinstallation = AsyncMock(
            side_effect=Exception('Database connection error')
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await reinstall_gitlab_webhook(mock_request)

        assert exc_info.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert exc_info.value.detail == 'Failed to mark webhook for reinstallation'

    @pytest.mark.asyncio
    @patch('server.routes.integration.gitlab.get_user_auth')
    @patch('server.routes.integration.gitlab.webhook_store')
    @patch('server.routes.integration.gitlab.logger')
    async def test_reinstall_webhook_logs_success(
        self,
        mock_logger,
        mock_webhook_store,
        mock_get_auth,
        mock_request,
        mock_user_auth,
    ):
        """Test that successful reinstallation is logged."""
        # Arrange
        mock_get_auth.return_value = mock_user_auth
        mock_webhook_store.mark_webhook_for_reinstallation = AsyncMock(return_value=3)

        # Act
        await reinstall_gitlab_webhook(mock_request)

        # Assert
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        assert 'GitLab webhook marked for reinstallation' in call_args[0][0]
        assert call_args[1]['extra']['user_id'] == 'test_user_id'
        assert call_args[1]['extra']['webhook_marked'] == 3
