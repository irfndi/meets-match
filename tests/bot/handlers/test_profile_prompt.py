import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Update
from telegram.ext import ContextTypes


# Need to ensure we patch the correct module where prompt_for_next_missing_field is defined
@pytest.fixture
def mock_profile_module():
    # Import the module first
    import src.bot.handlers.profile as profile_module

    # Patch attributes on the imported module object
    with (
        patch.object(profile_module, "get_user") as mock_get_user,
        patch.object(profile_module, "get_missing_required_fields") as mock_missing_req,
        patch.object(profile_module, "get_missing_recommended_fields") as mock_missing_rec,
        patch.object(profile_module, "check_and_update_profile_complete") as mock_check_complete,
        patch.object(profile_module, "skip_keyboard"),
    ):
        yield profile_module, mock_get_user, mock_missing_req, mock_missing_rec, mock_check_complete


@pytest.mark.asyncio
async def test_prompt_for_next_missing_field_cooldown(mock_profile_module):
    profile_module, _, mock_missing_req, mock_missing_rec, _ = mock_profile_module

    # Setup mocks
    update = MagicMock(spec=Update)
    update.effective_message = MagicMock()
    update.effective_message.reply_text = AsyncMock()
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}
    user_id = "123"

    # User has all required fields
    mock_missing_req.return_value = []
    # User missing Bio (recommended)
    mock_missing_rec.return_value = ["bio"]

    # Case 1: Never skipped before
    result = await profile_module.prompt_for_next_missing_field(update, context, user_id)
    assert result is True
    update.effective_message.reply_text.assert_called()
    # The prompt for bio is "Tell us a bit about yourself..."
    args = update.effective_message.reply_text.call_args[0]
    assert "Tell us a bit about yourself" in args[0]


@pytest.mark.asyncio
async def test_prompt_for_required_gender_preference_sets_state():
    import src.bot.handlers.profile as profile

    update = MagicMock(spec=Update)
    update.effective_message = MagicMock()
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    with (
        patch.object(profile, "get_user"),
        patch.object(profile, "get_missing_required_fields", return_value=["gender_preference"]),
        patch.object(profile, "get_missing_recommended_fields", return_value=[]),
        patch.object(profile, "_send_message_safe", AsyncMock(return_value=True)) as mock_send,
        patch.object(profile, "gender_preference_required_keyboard", return_value="kb"),
    ):
        result = await profile.prompt_for_next_missing_field(update, context, "123")

        assert result is True
        assert context.user_data[profile.STATE_AWAITING_GENDER_PREF] is True
        # Expect 2 calls: one for "needs X" and one for "Who would you like..."
        assert mock_send.call_count == 2
        args, kwargs = mock_send.call_args
        assert "match with" in args[2].lower()
        assert kwargs.get("reply_markup") == "kb"


@pytest.mark.asyncio
async def test_gender_preference_skip_blocked():
    import src.bot.handlers.profile as profile

    user_id = "123"

    update = MagicMock(spec=Update)
    update.effective_user = MagicMock()
    update.effective_user.id = 123
    update.message = MagicMock()
    update.message.text = "Skip"
    update.message.reply_text = AsyncMock()
    update.effective_message = update.message

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {profile.STATE_AWAITING_GENDER_PREF: True}

    mock_user = MagicMock()
    mock_user.is_sleeping = False

    def mock_get_user_sync(uid):
        return mock_user

    with (
        patch("src.bot.middleware.auth.get_user", side_effect=mock_get_user_sync),
        patch.object(profile, "get_user", side_effect=mock_get_user_sync),
        patch.object(profile, "get_missing_required_fields", return_value=["gender_preference"]) as mock_missing_req,
        patch.object(profile, "get_missing_recommended_fields", return_value=["bio"]),
    ):
        # Bypass authentication middleware by calling the wrapped function
        await profile.handle_text_message(update, context)

        update.message.reply_text.assert_called()
        assert "cannot be skipped" in update.message.reply_text.call_args[0][0]

        # Case 2: Skipped recently (within 24 hours)
        # First clear required fields so we can test recommended field skipping logic
        mock_missing_req.return_value = []
        context.user_data["skipped_profile_fields"] = {"bio": time.time()}
        update.effective_message.reply_text.reset_mock()

        result = await profile.prompt_for_next_missing_field(update, context, user_id)
        assert result is False
        # Should NOT prompt for bio
        # But should print "Profile complete" because default silent_if_complete=False
        update.effective_message.reply_text.assert_called()
        assert "complete" in update.effective_message.reply_text.call_args[0][0].lower()

        # Case 3: Skipped recently with silent_if_complete=True
        update.effective_message.reply_text.reset_mock()
        result = await profile.prompt_for_next_missing_field(update, context, user_id, silent_if_complete=True)
        assert result is False
        # Should be silent (no "Profile complete" message)
        update.effective_message.reply_text.assert_not_called()

        # Case 4: Skipped long ago (> 24 hours)
        context.user_data["skipped_profile_fields"] = {"bio": time.time() - (25 * 3600)}
        update.effective_message.reply_text.reset_mock()

        result = await profile.prompt_for_next_missing_field(update, context, user_id)
        assert result is True
        update.effective_message.reply_text.assert_called()
        args = update.effective_message.reply_text.call_args[0]
        assert "Tell us a bit about yourself" in args[0]
