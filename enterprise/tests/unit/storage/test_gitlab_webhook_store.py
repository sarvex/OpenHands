"""Unit tests for GitlabWebhookStore."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from storage.base import Base
from storage.gitlab_webhook import GitlabWebhook
from storage.gitlab_webhook_store import GitlabWebhookStore


@pytest.fixture
async def async_engine():
    """Create an async SQLite engine for testing."""
    engine = create_async_engine(
        'sqlite+aiosqlite:///:memory:',
        poolclass=StaticPool,
        connect_args={'check_same_thread': False},
        echo=False,
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest.fixture
async def async_session_maker(async_engine):
    """Create an async session maker for testing."""
    return async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def webhook_store(async_session_maker):
    """Create a GitlabWebhookStore instance for testing."""
    return GitlabWebhookStore(a_session_maker=async_session_maker)


@pytest.fixture
async def sample_webhooks(async_session_maker):
    """Create sample webhook records for testing."""
    async with async_session_maker() as session:
        # Create webhooks for user_1
        webhook1 = GitlabWebhook(
            project_id='project-1',
            group_id=None,
            user_id='user_1',
            webhook_exists=True,
            webhook_url='https://example.com/webhook',
            webhook_secret='secret-1',
            webhook_uuid='uuid-1',
        )
        webhook2 = GitlabWebhook(
            project_id='project-2',
            group_id=None,
            user_id='user_1',
            webhook_exists=True,
            webhook_url='https://example.com/webhook',
            webhook_secret='secret-2',
            webhook_uuid='uuid-2',
        )
        webhook3 = GitlabWebhook(
            project_id=None,
            group_id='group-1',
            user_id='user_1',
            webhook_exists=False,  # Already marked for reinstallation
            webhook_url='https://example.com/webhook',
            webhook_secret='secret-3',
            webhook_uuid='uuid-3',
        )

        # Create webhook for user_2
        webhook4 = GitlabWebhook(
            project_id='project-3',
            group_id=None,
            user_id='user_2',
            webhook_exists=True,
            webhook_url='https://example.com/webhook',
            webhook_secret='secret-4',
            webhook_uuid='uuid-4',
        )

        session.add_all([webhook1, webhook2, webhook3, webhook4])
        await session.commit()

        # Refresh to get IDs (outside of begin() context)
        await session.refresh(webhook1)
        await session.refresh(webhook2)
        await session.refresh(webhook3)
        await session.refresh(webhook4)

    return [webhook1, webhook2, webhook3, webhook4]


class TestMarkWebhookForReinstallation:
    """Test cases for mark_webhook_for_reinstallation method."""

    @pytest.mark.asyncio
    async def test_mark_webhooks_for_user_with_multiple_webhooks(
        self, webhook_store, async_session_maker, sample_webhooks
    ):
        """Test marking multiple webhooks for reinstallation for a user."""
        # Arrange
        user_id = 'user_1'
        expected_count = 3  # user_1 has 3 webhooks

        # Act
        webhooks_marked = await webhook_store.mark_webhook_for_reinstallation(user_id)

        # Assert
        assert webhooks_marked == expected_count

        # Verify all webhooks for user_1 are marked as webhook_exists=False
        async with async_session_maker() as session:
            from sqlalchemy import select

            result = await session.execute(
                select(GitlabWebhook).where(GitlabWebhook.user_id == user_id)
            )
            user_webhooks = result.scalars().all()

            assert len(user_webhooks) == expected_count
            for webhook in user_webhooks:
                assert webhook.webhook_exists is False

            # Verify webhooks for other users are not affected
            result_other = await session.execute(
                select(GitlabWebhook).where(GitlabWebhook.user_id == 'user_2')
            )
            other_webhooks = result_other.scalars().all()
            assert len(other_webhooks) == 1
            assert other_webhooks[0].webhook_exists is True

    @pytest.mark.asyncio
    async def test_mark_webhooks_for_user_with_single_webhook(
        self, webhook_store, async_session_maker, sample_webhooks
    ):
        """Test marking a single webhook for reinstallation."""
        # Arrange
        user_id = 'user_2'
        expected_count = 1

        # Act
        webhooks_marked = await webhook_store.mark_webhook_for_reinstallation(user_id)

        # Assert
        assert webhooks_marked == expected_count

        # Verify the webhook is marked
        async with async_session_maker() as session:
            from sqlalchemy import select

            result = await session.execute(
                select(GitlabWebhook).where(GitlabWebhook.user_id == user_id)
            )
            user_webhooks = result.scalars().all()

            assert len(user_webhooks) == expected_count
            assert user_webhooks[0].webhook_exists is False

    @pytest.mark.asyncio
    async def test_mark_webhooks_for_user_with_no_webhooks(
        self, webhook_store, async_session_maker
    ):
        """Test marking webhooks for a user with no existing webhooks."""
        # Arrange
        user_id = 'user_with_no_webhooks'

        # Act
        webhooks_marked = await webhook_store.mark_webhook_for_reinstallation(user_id)

        # Assert
        assert webhooks_marked == 0

    @pytest.mark.asyncio
    async def test_mark_webhooks_only_affects_target_user(
        self, webhook_store, async_session_maker, sample_webhooks
    ):
        """Test that marking webhooks only affects the specified user."""
        # Arrange
        target_user_id = 'user_1'
        other_user_id = 'user_2'

        # Act
        await webhook_store.mark_webhook_for_reinstallation(target_user_id)

        # Assert
        async with async_session_maker() as session:
            from sqlalchemy import select

            # Verify target user's webhooks are marked
            target_result = await session.execute(
                select(GitlabWebhook).where(GitlabWebhook.user_id == target_user_id)
            )
            target_webhooks = target_result.scalars().all()
            for webhook in target_webhooks:
                assert webhook.webhook_exists is False

            # Verify other user's webhooks are unchanged
            other_result = await session.execute(
                select(GitlabWebhook).where(GitlabWebhook.user_id == other_user_id)
            )
            other_webhooks = other_result.scalars().all()
            assert len(other_webhooks) == 1
            assert other_webhooks[0].webhook_exists is True

    @pytest.mark.asyncio
    async def test_mark_webhooks_includes_already_marked_webhooks(
        self, webhook_store, async_session_maker, sample_webhooks
    ):
        """Test that webhooks already marked for reinstallation are still counted."""
        # Arrange
        user_id = 'user_1'
        # user_1 has 3 webhooks, one already has webhook_exists=False

        # Act
        webhooks_marked = await webhook_store.mark_webhook_for_reinstallation(user_id)

        # Assert
        # Should still return 3 (all webhooks for the user)
        assert webhooks_marked == 3

        # Verify all are now False
        async with async_session_maker() as session:
            from sqlalchemy import select

            result = await session.execute(
                select(GitlabWebhook).where(GitlabWebhook.user_id == user_id)
            )
            user_webhooks = result.scalars().all()

            for webhook in user_webhooks:
                assert webhook.webhook_exists is False
