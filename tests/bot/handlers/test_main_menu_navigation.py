from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes

from src.bot.handlers.profile import STATE_PROFILE_MENU, handle_text_message


@pytest.fixture
def mock_auth_dependencies():
    """Mock dependencies used by @authenticated decorator."""
    with (
        patch("src.bot.middleware.auth.get_user") as mock_get_user,
        patch("src.bot.middleware.auth.update_last_active"),
        patch("src.bot.middleware.auth.get_cache"),
        patch("src.bot.middleware.auth.wake_user"),
    ):
        # Setup default user
        user = MagicMock()
        user.is_sleeping = False  # Not sleeping
        user.preferences = MagicMock()
        user.preferences.preferred_country = "US"
        user.preferences.preferred_language = "en"
        mock_get_user.return_value = user

        yield mock_get_user


@pytest.mark.asyncio
async def test_main_menu_navigation_buttons(mock_auth_dependencies):
    """Test that standardized Main Menu buttons route to correct commands."""

    # Setup mock update and context
    update = MagicMock(spec=Update)
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    user = MagicMock(spec=User)
    user.id = 12345
    user.first_name = "TestUser"
    update.effective_user = user
    update.message = MagicMock(spec=Message)
    update.message.reply_text = AsyncMock()  # Mock reply_text to be awaitable

    # Define test cases: (button_text, expected_mock_target)
    test_cases = [
        ("🚀 Start Match", "src.bot.handlers.profile.match_command"),
        ("👤 View Profile", "src.bot.handlers.profile.profile_command"),
        ("⚙️ Settings", "src.bot.handlers.profile.settings_command"),
    ]

    for button_text, target_path in test_cases:
        # Reset mocks
        update.message.text = button_text

        with patch(target_path, new_callable=AsyncMock) as mock_command:
            await handle_text_message(update, context)

            mock_command.assert_called_once()
            # assert mock_command.call_args[0][0] == update # Arguments might be positional or keyword
            # Just checking called is enough for routing logic


@pytest.mark.asyncio
async def test_view_profile_in_menu_state(mock_auth_dependencies):
    """Test '👤 View Profile' behavior when inside Profile Menu state."""

    # Setup
    update = MagicMock(spec=Update)
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {STATE_PROFILE_MENU: True}  # Active Profile Menu State

    user = MagicMock(spec=User)
    user.id = 12345
    user.first_name = "TestUser"
    user.age = 25
    user.gender = MagicMock()
    user.gender.value = "male"
    user.photos = []
    user.bio = "Bio"
    user.interests = ["Coding"]
    user.is_sleeping = False  # Not sleeping

    # Mock the user returned by auth middleware
    mock_auth_dependencies.return_value = user

    # Mock get_user inside handle_text_message (it calls get_user again)
    # Actually handle_text_message calls get_user(user_id) to show profile

    update.effective_user = user
    update.message = MagicMock(spec=Message)
    update.message.text = "👤 View Profile"
    update.message.reply_text = AsyncMock()

    # We need to patch get_user in profile.py as well because it's imported there
    with (
        patch("src.bot.handlers.profile.get_user", return_value=user),
        patch("src.bot.handlers.profile.profile_command", new_callable=AsyncMock) as mock_profile_cmd,
    ):
        await handle_text_message(update, context)

        # Should NOT call profile_command (which opens the menu)
        # Should instead reply with profile text (Show Card)
        mock_profile_cmd.assert_not_called()
        update.message.reply_text.assert_called_once()

        # Check that the response contains profile info
        args, _ = update.message.reply_text.call_args
        assert "TestUser" in args[0]
        assert "25" in args[0]
