from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes

from src.bot.handlers.profile import (
    STATE_AWAITING_PHOTO,
    STATE_PENDING_MEDIA,
    STATE_PROFILE_SETUP,
    _next_profile_step,
    handle_text_message,
    prompt_for_next_missing_field,
)
from src.models.user import User as DbUser


@pytest.fixture
def mock_update():
    update = MagicMock(spec=Update)
    update.message = MagicMock(spec=Message)
    update.message.reply_text = AsyncMock()
    update.message.reply_media_group = AsyncMock()
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
    user.is_sleeping = False
    user.is_active = True
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
    """Test that _next_profile_step prompts with replacement option when user has photos."""

    mock_user.photos = ["photo1.jpg"]

    with (
        patch("src.bot.handlers.profile.get_user", return_value=mock_user),
        patch("src.bot.handlers.profile.get_settings") as mock_settings,
        patch("src.bot.handlers.profile.media_upload_keyboard") as mock_keyboard,
        patch("src.bot.handlers.profile.set_user_editing_state"),
        patch("src.bot.handlers.profile.send_media_group_safe", new_callable=AsyncMock) as mock_send_media,
    ):
        mock_settings.return_value.MAX_MEDIA_COUNT = 3
        # Set current step to 5 (Location), so next step is 6 (Photos)
        mock_context.user_data[STATE_PROFILE_SETUP] = 5

        await _next_profile_step(mock_update, mock_context)

        # Verify media sent
        mock_send_media.assert_called_once_with(mock_update.message.reply_media_group, mock_user.photos)

        # Verify prompt
        args, _ = mock_update.message.reply_text.call_args
        assert "You have 1 photos/videos" in args[0]
        assert "REPLACE" in args[0]
        # Keyboard should start at 0 for replacement flow, but allow_done should be True
        mock_keyboard.assert_called_with(0, 3, allow_done=True)


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


@pytest.mark.asyncio
async def test_handle_done_button_keep_existing(mock_update, mock_context, mock_user):
    """Test Done button when user has existing photos but no new uploads (Keep Existing)."""

    mock_update.message.text = "✅ Done"
    mock_user.photos = ["photo1.jpg"]
    mock_context.user_data[STATE_PENDING_MEDIA] = []  # Empty pending

    with (
        patch("src.bot.handlers.profile.get_user", return_value=mock_user),
        patch("src.bot.middleware.auth.get_user", return_value=mock_user),
        patch("src.bot.middleware.auth.update_last_active"),
        patch("src.bot.handlers.profile._next_profile_step", new_callable=AsyncMock) as mock_next_step,
        patch("src.bot.handlers.profile.get_settings") as mock_settings,
        patch("src.bot.handlers.profile.media_upload_keyboard"),
    ):
        mock_settings.return_value.MAX_MEDIA_COUNT = 3
        mock_context.user_data[STATE_PROFILE_SETUP] = 6  # Photos step

        await handle_text_message(mock_update, mock_context)

        args, _ = mock_update.message.reply_text.call_args
        assert "Keeping existing" in args[0]
        mock_next_step.assert_called_once()
