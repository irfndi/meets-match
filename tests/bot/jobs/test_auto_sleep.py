"""Tests for auto-sleep inactive users job."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.bot.jobs import AUTO_SLEEP_INACTIVITY_MINUTES, auto_sleep_inactive_users_job
from src.models.user import User


@pytest.mark.asyncio
async def test_auto_sleep_inactive_users_job_with_users():
    """Test auto-sleep job with inactive users."""
    context = MagicMock()
    context.bot.send_message = AsyncMock()

    # Create mock inactive users
    user1 = MagicMock(spec=User)
    user1.id = "123"
    user1.is_sleeping = False
    user1.is_active = True
    user1.last_active = datetime.now(timezone.utc) - timedelta(minutes=20)

    user2 = MagicMock(spec=User)
    user2.id = "456"
    user2.is_sleeping = False
    user2.is_active = True
    user2.last_active = datetime.now(timezone.utc) - timedelta(minutes=30)

    with (
        patch("src.bot.jobs.get_users_for_auto_sleep") as mock_get_users,
        patch("src.bot.jobs.set_user_sleeping") as mock_set_sleeping,
    ):
        mock_get_users.return_value = [user1, user2]

        await auto_sleep_inactive_users_job(context)

        # Verify get_users_for_auto_sleep was called with correct threshold
        mock_get_users.assert_called_once_with(AUTO_SLEEP_INACTIVITY_MINUTES)

        # Verify both users were put to sleep
        assert mock_set_sleeping.call_count == 2
        mock_set_sleeping.assert_any_call("123", True)
        mock_set_sleeping.assert_any_call("456", True)

        # Verify notifications were sent
        assert context.bot.send_message.call_count == 2


@pytest.mark.asyncio
async def test_auto_sleep_inactive_users_job_no_users():
    """Test auto-sleep job with no inactive users."""
    context = MagicMock()
    context.bot.send_message = AsyncMock()

    with (
        patch("src.bot.jobs.get_users_for_auto_sleep") as mock_get_users,
        patch("src.bot.jobs.set_user_sleeping") as mock_set_sleeping,
    ):
        mock_get_users.return_value = []

        await auto_sleep_inactive_users_job(context)

        mock_set_sleeping.assert_not_called()
        context.bot.send_message.assert_not_called()


@pytest.mark.asyncio
async def test_auto_sleep_inactive_users_job_notification_failure():
    """Test auto-sleep job handles notification failures gracefully."""
    context = MagicMock()
    context.bot.send_message = AsyncMock(side_effect=Exception("User blocked bot"))

    user = MagicMock(spec=User)
    user.id = "123"
    user.is_sleeping = False
    user.is_active = True
    user.last_active = datetime.now(timezone.utc) - timedelta(minutes=20)

    with (
        patch("src.bot.jobs.get_users_for_auto_sleep") as mock_get_users,
        patch("src.bot.jobs.set_user_sleeping") as mock_set_sleeping,
    ):
        mock_get_users.return_value = [user]

        # Should not raise an exception
        await auto_sleep_inactive_users_job(context)

        # User should still be put to sleep despite notification failure
        mock_set_sleeping.assert_called_once_with("123", True)


@pytest.mark.asyncio
async def test_auto_sleep_inactive_users_job_set_sleeping_failure():
    """Test auto-sleep job handles set_sleeping failures gracefully."""
    context = MagicMock()
    context.bot.send_message = AsyncMock()

    user = MagicMock(spec=User)
    user.id = "123"
    user.is_sleeping = False
    user.is_active = True
    user.last_active = datetime.now(timezone.utc) - timedelta(minutes=20)

    with (
        patch("src.bot.jobs.get_users_for_auto_sleep") as mock_get_users,
        patch("src.bot.jobs.set_user_sleeping") as mock_set_sleeping,
    ):
        mock_get_users.return_value = [user]
        mock_set_sleeping.side_effect = Exception("Database error")

        # Should not raise an exception
        await auto_sleep_inactive_users_job(context)

        # set_sleeping was attempted
        mock_set_sleeping.assert_called_once()
        # But notification should not be sent due to failure
        context.bot.send_message.assert_not_called()


@pytest.mark.asyncio
async def test_auto_sleep_job_captures_errors_in_otel():
    """Test that auto-sleep job captures errors in OpenTelemetry."""
    context = MagicMock()
    context.bot.send_message = AsyncMock()

    user = MagicMock(spec=User)
    user.id = "123"

    db_error = Exception("Database connection failed")

    with (
        patch("src.bot.jobs.get_users_for_auto_sleep") as mock_get_users,
        patch("src.bot.jobs.set_user_sleeping") as mock_set_sleeping,
        patch("src.bot.jobs.tracer") as mock_tracer,
    ):
        mock_get_users.return_value = [user]
        mock_set_sleeping.side_effect = db_error

        mock_parent_span = MagicMock()
        mock_child_span = MagicMock()
        # First call returns parent span, second call returns child span
        mock_tracer.start_as_current_span.return_value.__enter__.side_effect = [mock_parent_span, mock_child_span]

        await auto_sleep_inactive_users_job(context)

        # Verify OpenTelemetry captured the exception on child span
        mock_child_span.record_exception.assert_called_once_with(db_error)
