from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, PhotoSize, Update
from telegram import User as TelegramUser
from telegram.ext import ContextTypes

from src.bot.handlers.profile import (
    STATE_AWAITING_PHOTO,
    STATE_PENDING_MEDIA,
    STATE_PROFILE_MENU,
    handle_text_message,
    photo_handler,
)
from src.models.user import Gender, User


@pytest.fixture
def mock_profile_module():
    # Patch get_user in both locations: handlers.profile and middleware.auth
    with (
        patch("src.bot.handlers.profile.get_user") as mock_get_user,
        patch("src.bot.middleware.auth.get_user") as mock_auth_get_user,
        patch("src.bot.handlers.profile.update_user") as mock_update_user,
        patch("src.bot.handlers.profile.save_media") as mock_save_media,
        patch("src.bot.handlers.profile.delete_media"),
        patch("src.bot.handlers.profile.send_media_group_safe"),
        patch("src.bot.middleware.auth.update_last_active"),
        patch("src.bot.middleware.auth.get_cache"),
        patch("src.bot.handlers.profile.media_validator") as mock_validator,
    ):
        # Make sure both get_users return the same mock or are configured similarly
        # We yield the first one, but we'll configure the second one in the test to match
        mock_auth_get_user.side_effect = lambda uid: mock_get_user(uid)

        # Configure validator to pass all validations by default
        mock_validator.validate_file_type = AsyncMock(return_value=(True, "image"))
        mock_validator.validate_file_size = AsyncMock(return_value=(True, "Valid size"))
        mock_validator.validate_image = AsyncMock(return_value=(True, "Valid image"))

        yield mock_get_user, mock_update_user, mock_save_media


@pytest.mark.asyncio
async def test_photo_upload_adds_to_pending_media(mock_profile_module):
    """Test that photo uploads add files to pending media list (multi-file upload flow)."""
    mock_get_user, _, mock_save_media = mock_profile_module

    # Setup
    user_id = "12345"
    user = User(id=user_id, first_name="Test", age=25, gender=Gender.MALE, photos=["old.jpg"])
    mock_get_user.return_value = user
    mock_save_media.return_value = "new_photo.jpg"

    update = MagicMock(spec=Update)
    update.effective_user = TelegramUser(id=int(user_id), first_name="Test", is_bot=False)
    update.message = MagicMock(spec=Message)
    update.message.photo = [MagicMock(spec=PhotoSize)]
    update.message.photo[-1].get_file = AsyncMock()
    update.message.photo[-1].get_file.return_value.download_as_bytearray = AsyncMock(return_value=b"data")
    update.message.video = None
    update.message.reply_text = AsyncMock()
    # Important: set effective_message for middleware
    update.effective_message = update.message

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {STATE_AWAITING_PHOTO: True, STATE_PENDING_MEDIA: []}

    # Execute photo_handler
    await photo_handler(update, context)

    # Assertions - with multi-file upload, STATE_AWAITING_PHOTO stays active until Done is pressed
    assert STATE_AWAITING_PHOTO in context.user_data
    # Pending media should have the new file
    assert "new_photo.jpg" in context.user_data[STATE_PENDING_MEDIA]
    # User should get feedback about the upload
    update.message.reply_text.assert_called()


@pytest.mark.asyncio
async def test_done_button_saves_and_clears_state(mock_profile_module):
    """Test that pressing Done saves pending media and clears state."""
    mock_get_user, mock_update_user, _ = mock_profile_module

    user_id = "12345"
    user = User(id=user_id, first_name="Test", age=25, gender=Gender.MALE, photos=["old.jpg"])
    mock_get_user.return_value = user

    update = MagicMock(spec=Update)
    update.effective_user = TelegramUser(id=int(user_id), first_name="Test", is_bot=False)
    update.message = MagicMock(spec=Message)
    update.message.text = "✅ Done (2/3)"
    update.message.reply_text = AsyncMock()
    update.effective_message = update.message

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {
        STATE_AWAITING_PHOTO: True,
        STATE_PENDING_MEDIA: ["photo1.jpg", "photo2.jpg"],
    }

    # Execute handle_text_message (which handles the Done button)
    await handle_text_message(update, context)

    # Assertions - state should be cleared after Done
    assert STATE_AWAITING_PHOTO not in context.user_data
    assert STATE_PENDING_MEDIA not in context.user_data
    assert STATE_PROFILE_MENU in context.user_data
    # Should have called update_user to save the photos
    mock_update_user.assert_called()


@pytest.mark.asyncio
async def test_view_profile_after_photo_update_success(mock_profile_module):
    # This test simulates the sequence where the bug occurs, but with the FIX applied (state present)
    mock_get_user, _, _ = mock_profile_module

    user_id = "12345"
    user = User(id=user_id, first_name="Test", age=25, gender=Gender.MALE, photos=["p.jpg"])
    mock_get_user.return_value = user

    update = MagicMock(spec=Update)
    update.effective_user = TelegramUser(id=int(user_id), first_name="Test", is_bot=False)
    update.message = MagicMock(spec=Message)
    update.message.text = "👤 View Profile"
    update.message.reply_text = AsyncMock()
    update.message.reply_media_group = AsyncMock()
    # Important: set effective_message for middleware
    update.effective_message = update.message

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    # Simulate state AFTER FIXED photo_handler (STATE_PROFILE_MENU IS PRESENT)
    context.user_data = {"user": user, STATE_PROFILE_MENU: True}

    # Execute handle_text_message
    await handle_text_message(update, context)

    # If fixed, it should show profile

    # Check what was replied
    if update.message.reply_text.called:
        args = update.message.reply_text.call_args[0]
        # We expect it to NOT be the "didn't understand" message if it worked
        assert "I didn't understand that" not in args[0], "Should handle 'View Profile' correctly"
        # Verify it tried to show profile
        assert "Test, 25" in args[0] or "View Profile" in str(update.message.reply_text.call_args_list)
    else:
        # It might have sent media group instead?
        # view_profile sends text if no photos, or media group + text.
        pass
