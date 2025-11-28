from datetime import datetime, timedelta, timezone
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest

from src.bot.jobs import INACTIVITY_DAYS, inactive_user_reminder_job
from src.models.user import Gender, Location, Preferences, User


@pytest.mark.asyncio
async def test_inactive_user_reminder_job():
    # Mock context
    context = MagicMock()
    context.bot.send_message = AsyncMock()

    # Mock users
    user1 = MagicMock(spec=User)
    user1.id = "123"
    user1.last_reminded_at = None
    user1.location = Location(city="New York", country="USA", latitude=0, longitude=0)
    user1.preferences = Preferences(gender_preference=[Gender.FEMALE])

    user2 = MagicMock(spec=User)
    user2.id = "456"
    user2.last_reminded_at = datetime.now(timezone.utc) - timedelta(hours=24)  # Reminded 24h ago
    user2.location = Location(city="London", country="UK", latitude=0, longitude=0)
    user2.preferences = Preferences(gender_preference=[Gender.MALE])

    # Mock get_inactive_users
    with (
        patch("src.bot.jobs.get_inactive_users") as mock_get_users,
        patch("src.bot.jobs.update_user") as mock_update_user,
        patch("src.bot.jobs.get_pending_incoming_likes_count") as mock_get_pending,
    ):
        # Setup mock return values
        # For day 1, return user1
        # For other days, return empty list
        def get_users_side_effect(days):
            if days == 1:
                return [user1]
            if days == 3:
                return [user2]
            return []

        mock_get_users.side_effect = get_users_side_effect

        # Setup pending likes
        # User 1 has pending likes (Day 1) -> Match based msg
        # User 2 has NO pending likes (Day 3) -> Generic msg
        def get_pending_side_effect(user_id):
            if user_id == "123":
                return 5
            return 0

        mock_get_pending.side_effect = get_pending_side_effect

        await inactive_user_reminder_job(context)

        # Verify get_inactive_users called for each day in INACTIVITY_DAYS
        assert mock_get_users.call_count == len(INACTIVITY_DAYS)

        # Verify messages sent
        assert context.bot.send_message.call_count == 2

        # Verify user1 message (Day 1, Pending Likes > 0)
        call_args1 = context.bot.send_message.call_args_list[0]
        assert call_args1.kwargs["chat_id"] == "123"
        # Should be match-based message
        msg1 = call_args1.kwargs["text"]
        assert any(x in msg1 for x in ["want to chat", "pending matches", "liked your profile"])

        # Verify user2 message (Day 3, Pending Likes == 0)
        call_args2 = context.bot.send_message.call_args_list[1]
        assert call_args2.kwargs["chat_id"] == "456"
        # Should be generic message
        msg2 = call_args2.kwargs["text"]
        assert any(x in msg2 for x in ["looking for a match", "potential matches", "buzzing"])

        # Verify update_user called
        assert mock_update_user.call_count == 2
        mock_update_user.assert_any_call("123", {"last_reminded_at": ANY})
        mock_update_user.assert_any_call("456", {"last_reminded_at": ANY})


@pytest.mark.asyncio
async def test_inactive_user_reminder_long_term():
    # Mock context
    context = MagicMock()
    context.bot.send_message = AsyncMock()

    # Mock user inactive for 7 days
    user = MagicMock(spec=User)
    user.id = "789"
    user.last_reminded_at = None
    user.location = Location(city="Paris", country="France", latitude=0, longitude=0)
    user.preferences = Preferences(gender_preference=[Gender.FEMALE])

    with (
        patch("src.bot.jobs.get_inactive_users") as mock_get_users,
        patch("src.bot.jobs.update_user"),
        patch("src.bot.jobs.get_pending_incoming_likes_count") as mock_get_pending,
    ):
        # Return user for day 7
        def get_users_side_effect(days):
            if days == 7:
                return [user]
            return []

        mock_get_users.side_effect = get_users_side_effect

        # Even if they have pending likes, > 3 days should be "We miss you"
        mock_get_pending.return_value = 5

        await inactive_user_reminder_job(context)

        # Verify message
        assert context.bot.send_message.call_count == 1
        call_args = context.bot.send_message.call_args
        assert call_args.kwargs["chat_id"] == "789"
        assert "We miss you" in call_args.kwargs["text"]


@pytest.mark.asyncio
async def test_inactive_user_reminder_skip_recently_reminded():
    # Mock context
    context = MagicMock()
    context.bot.send_message = AsyncMock()

    # Mock user reminded recently
    user1 = MagicMock(spec=User)
    user1.id = "123"
    user1.last_reminded_at = datetime.now(timezone.utc) - timedelta(hours=2)  # Reminded 2h ago

    with (
        patch("src.bot.jobs.get_inactive_users") as mock_get_users,
        patch("src.bot.jobs.update_user") as mock_update_user,
    ):
        mock_get_users.return_value = [user1]

        # Only run for one day to simplify
        with patch("src.bot.jobs.INACTIVITY_DAYS", [1]):
            await inactive_user_reminder_job(context)

        # Verify NO message sent
        context.bot.send_message.assert_not_called()
        mock_update_user.assert_not_called()
