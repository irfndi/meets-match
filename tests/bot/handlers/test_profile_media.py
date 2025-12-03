from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes

from src.bot.handlers.profile import (
    STATE_AWAITING_PHOTO,
    STATE_PENDING_MEDIA,
    STATE_PROFILE_SETUP,
    _next_profile_step,
    prompt_for_next_missing_field,
)
from src.models.user import User as DbUser


@pytest.fixture
def mock_update():
    update = MagicMock(spec=Update)
    update.message = MagicMock(spec=Message)
    update.message.reply_text = AsyncMock()
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_message = update.message
    return update


@pytest.fixture
def mock_context():
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    # STATE_PROFILE_SETUP is "profile_setup_step"
    context.user_data = {STATE_PROFILE_SETUP: 0}
    return context


@pytest.fixture
def mock_user():
    user = MagicMock(spec=DbUser)
    user.id = "12345"
    user.first_name = "Test User"
    user.age = 25
    user.gender = "male"
    user.bio = "Just a test"
    user.interests = "testing"

    # Fix location
    mock_loc = MagicMock()
    mock_loc.city = "Test City"
    user.location = mock_loc

    user.photos = []
    user.is_profile_complete = False
    return user


@pytest.mark.asyncio
async def test_next_profile_step_photos_empty(mock_update, mock_context, mock_user):
    """Test that _next_profile_step prompts for photos when user has none."""

    # Setup mocks
    with (
        patch("src.bot.handlers.profile.get_user", return_value=mock_user),
        patch("src.bot.handlers.profile.get_settings") as mock_settings,
        patch("src.bot.handlers.profile.media_upload_keyboard") as mock_keyboard,
        patch("src.bot.handlers.profile.set_user_editing_state"),
    ):
        mock_settings.return_value.MAX_MEDIA_COUNT = 3

        # Set current step to 5 (Location), so next step is 6 (Photos)
        mock_context.user_data[STATE_PROFILE_SETUP] = 5

        await _next_profile_step(mock_update, mock_context)

        # Verify state
        assert mock_context.user_data[STATE_AWAITING_PHOTO] is True
        assert mock_context.user_data[STATE_PENDING_MEDIA] == []

        # Verify prompt
        args, _ = mock_update.message.reply_text.call_args
        assert "photos or videos" in args[0]
        assert "Limits" in args[0]
        mock_keyboard.assert_called_with(0, 3)


@pytest.mark.asyncio
async def test_next_profile_step_photos_existing(mock_update, mock_context, mock_user):
    """Test that _next_profile_step prompts with skip option when user has photos."""

    mock_user.photos = ["photo1.jpg"]

    with (
        patch("src.bot.handlers.profile.get_user", return_value=mock_user),
        patch("src.bot.handlers.profile.get_settings") as mock_settings,
        patch("src.bot.handlers.profile.media_upload_keyboard") as mock_keyboard,
        patch("src.bot.handlers.profile.set_user_editing_state"),
    ):
        mock_settings.return_value.MAX_MEDIA_COUNT = 3
        # Set current step to 5 (Location), so next step is 6 (Photos)
        mock_context.user_data[STATE_PROFILE_SETUP] = 5

        await _next_profile_step(mock_update, mock_context)

        # Verify prompt
        args, _ = mock_update.message.reply_text.call_args
        assert "You have 1 photos/videos" in args[0]
        assert "Skip" in args[0]
        mock_keyboard.assert_called_with(1, 3)


@pytest.mark.asyncio
async def test_prompt_for_next_missing_field_photos(mock_update, mock_context, mock_user):
    """Test that prompt_for_next_missing_field correctly asks for photos."""

    with (
        patch("src.bot.handlers.profile.get_user", return_value=mock_user),
        patch("src.bot.handlers.profile.get_missing_required_fields", return_value=["photos"]),
        patch("src.bot.handlers.profile.get_settings") as mock_settings,
        patch("src.bot.handlers.profile.media_upload_keyboard") as mock_keyboard,
    ):
        mock_settings.return_value.MAX_MEDIA_COUNT = 3

        await prompt_for_next_missing_field(mock_update, mock_context, "12345")

        # Verify state
        assert mock_context.user_data[STATE_AWAITING_PHOTO] is True
        assert mock_context.user_data[STATE_PENDING_MEDIA] == []

        # Verify prompt
        args, _ = mock_update.effective_message.reply_text.call_args
        assert "upload at least one photo" in args[0]
        mock_keyboard.assert_called_with(0, 3)
