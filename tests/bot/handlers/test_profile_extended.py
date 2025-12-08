import sys
from typing import Any, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import CallbackQuery, Message, Update, User
from telegram.ext import ContextTypes


# Fixture to provide the profile module with mocked dependencies
@pytest.fixture
def profile_module() -> Generator[Any, None, None]:
    # Ensure src.bot.middleware is mocked so @authenticated doesn't cause issues
    mock_middleware = MagicMock()
    mock_middleware.authenticated = lambda x: x
    mock_middleware.user_command_limiter = MagicMock(return_value=AsyncMock())

    # We need to patch sys.modules to inject our mock middleware
    with patch.dict(sys.modules, {"src.bot.middleware": mock_middleware}):
        # If profile was already imported, reload it or remove it to ensure it picks up the mock middleware
        if "src.bot.handlers.profile" in sys.modules:
            del sys.modules["src.bot.handlers.profile"]

        import src.bot.handlers.profile as pm

        yield pm


@pytest.fixture
def mock_update_context() -> tuple[MagicMock, MagicMock]:
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.message = AsyncMock(spec=Message)
    update.message.text = "test"
    update.message.reply_text = AsyncMock()
    update.effective_message = update.message

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}
    context.bot = MagicMock()
    context.bot.send_message = AsyncMock()

    return update, context


@pytest.mark.asyncio
async def test_save_bio_too_long(profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]) -> None:
    """Test that bios exceeding 300 characters are rejected."""
    update, context = mock_update_context
    long_bio = "a" * 301

    # We patch objects on the imported module
    with patch.object(profile_module, "get_user"), patch.object(profile_module, "update_user") as mock_update:
        result = await profile_module._save_bio(update, context, long_bio)

        assert result is False
        update.message.reply_text.assert_called()
        args = update.message.reply_text.call_args[0][0]
        assert "Bio is too long" in args
        mock_update.assert_not_called()


@pytest.mark.asyncio
async def test_save_interests_too_many(profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]) -> None:
    """Test that more than 10 interests are rejected."""
    update, context = mock_update_context
    interests = "1,2,3,4,5,6,7,8,9,10,11"

    with patch.object(profile_module, "get_user"), patch.object(profile_module, "update_user") as mock_update:
        result = await profile_module._save_interests(update, context, interests)

        assert result is False
        args = update.message.reply_text.call_args[0][0]
        assert "Too many interests" in args
        mock_update.assert_not_called()


@pytest.mark.asyncio
async def test_save_interests_empty(profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]) -> None:
    """Test that empty interests list is rejected."""
    update, context = mock_update_context
    interests = " , , "

    with patch.object(profile_module, "get_user"), patch.object(profile_module, "update_user") as mock_update:
        result = await profile_module._save_interests(update, context, interests)

        assert result is False
        args = update.message.reply_text.call_args[0][0]
        assert "provide at least one interest" in args
        mock_update.assert_not_called()


@pytest.mark.asyncio
async def test_process_manual_location_invalid_format(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test that invalid location format (missing comma) is rejected."""
    update, context = mock_update_context
    location_text = "CityOnly"

    with patch.object(profile_module, "get_user"):
        await profile_module.process_manual_location(update, context, location_text)

        args = update.message.reply_text.call_args[0][0]
        assert "Please use the format 'City, Country'" in args


@pytest.mark.asyncio
async def test_process_manual_location_geocode_fail(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test that geocoding failures are handled gracefully."""
    update, context = mock_update_context
    location_text = "Unknown, City"

    with patch.object(profile_module, "geocode_city", new_callable=AsyncMock) as mock_geocode:
        mock_geocode.return_value = None

        await profile_module.process_manual_location(update, context, location_text)

        args = update.message.reply_text.call_args[0][0]
        assert "couldn't find that city" in args


@pytest.mark.asyncio
async def test_process_manual_location_success(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test successful manual location processing and user update."""
    update, context = mock_update_context
    location_text = "Berlin, Germany"

    mock_geo_result = {"latitude": 52.52, "longitude": 13.40, "city": "Berlin", "country": "Germany"}

    # Mocking Preferences directly is not necessary here because the function retrieves preferences
    # via the user object returned by get_user. Therefore, we only need to mock get_user to return
    # a user object with a preferences attribute.

    mock_user = MagicMock()
    mock_user.preferences = MagicMock()
    mock_user.preferences.model_dump.return_value = {}

    with (
        patch.object(profile_module, "geocode_city", new_callable=AsyncMock) as mock_geocode,
        patch.object(profile_module, "update_user") as mock_update,
        patch.object(profile_module, "get_user", return_value=mock_user),
    ):
        mock_geocode.return_value = mock_geo_result

        await profile_module.process_manual_location(update, context, location_text)

        mock_update.assert_called()

        # Check if any call contains the expected string
        found = False
        for call in update.message.reply_text.call_args_list:
            args, _ = call
            if "Berlin, Germany" in args[0]:
                found = True
                break
        assert found, "Did not find location update message"


@pytest.mark.asyncio
async def test_gender_selection_invalid(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test that invalid gender selection is rejected."""
    update, context = mock_update_context
    context.user_data["awaiting_gender"] = True

    with patch.object(profile_module, "get_user"):
        await profile_module.process_gender_selection(update, context, "Alien")

        args = update.message.reply_text.call_args[0][0]
        assert "Invalid gender" in args


@pytest.mark.asyncio
async def test_gender_selection_cancel(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test that Cancel command properly exits gender selection."""
    update, context = mock_update_context
    context.user_data["awaiting_gender"] = True
    context.user_data["profile_setup_step"] = 2

    with patch.object(profile_module, "get_user"):
        await profile_module.process_gender_selection(update, context, "Cancel")

        assert "profile_setup_step" not in context.user_data
        args = update.message.reply_text.call_args[0][0]
        assert "canceled" in args.lower()


@pytest.mark.asyncio
async def test_photo_handler_limit_reached(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test that photo upload is rejected when maximum file count is reached."""
    update, context = mock_update_context

    # Mock settings
    mock_settings = MagicMock()
    mock_settings.MAX_MEDIA_COUNT = 3

    context.user_data["pending_media"] = ["1", "2", "3"]

    # Simulate photo
    update.message.photo = [MagicMock()]

    with (
        patch.object(profile_module, "get_settings", return_value=mock_settings),
        patch.object(profile_module, "get_user"),
    ):
        await profile_module.photo_handler(update, context)

        args = update.message.reply_text.call_args[0][0]
        assert "already added 3 files" in args


@pytest.mark.asyncio
async def test_photo_handler_validation_fail(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test that photo validation failures are properly handled."""
    update, context = mock_update_context

    mock_settings = MagicMock()
    mock_settings.MAX_MEDIA_COUNT = 3

    # Simulate photo
    photo_file = MagicMock()
    photo_file.get_file = AsyncMock()
    photo_file.get_file.return_value.download_as_bytearray = AsyncMock(return_value=b"fake_data")
    update.message.photo = [photo_file]

    # Mock validator
    mock_validator = AsyncMock()
    mock_validator.validate_file_size.return_value = (False, "Too big")

    with (
        patch.object(profile_module, "get_settings", return_value=mock_settings),
        patch.object(profile_module, "get_user"),
        patch.object(profile_module, "media_validator", mock_validator),
    ):
        await profile_module.photo_handler(update, context)

        args = update.message.reply_text.call_args[0][0]
        assert "Too big" in args


@pytest.mark.asyncio
async def test_view_profile_callback(profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]) -> None:
    """Test viewing profile via callback query."""
    update, context = mock_update_context
    update.callback_query = MagicMock(spec=CallbackQuery)
    update.callback_query.data = "view_profile_999"
    update.callback_query.message = MagicMock()
    update.callback_query.answer = AsyncMock()
    update.callback_query.edit_message_text = AsyncMock()

    from src.models.user import Gender

    mock_user = MagicMock()
    mock_user.id = "999"
    mock_user.first_name = "Target"
    mock_user.age = 30
    mock_user.gender = Gender.MALE
    mock_user.photos = []  # No photos case

    with (
        patch.object(profile_module, "get_user", return_value=mock_user),
        patch.object(profile_module, "get_user_location_text", return_value="Wonderland"),
    ):
        await profile_module.view_profile_callback(update, context)

        update.callback_query.edit_message_text.assert_called()
        args = update.callback_query.edit_message_text.call_args[1]
        text = args.get("text", "")
        assert "Target" in text
        assert "30" in text
        assert "Wonderland" in text


@pytest.mark.asyncio
async def test_handle_text_message_skip_in_adhoc_mode(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test 'Skip' command in adhoc mode (completing missing fields one by one)."""
    update, context = mock_update_context
    update.message.text = "Skip"

    # Setup adhoc mode for bio
    context.user_data["adhoc_continue_profile"] = True
    context.user_data["awaiting_bio"] = True

    with (
        patch.object(profile_module, "prompt_for_next_missing_field", new_callable=AsyncMock) as mock_prompt,
        patch.object(profile_module, "get_user"),
    ):
        await profile_module.handle_text_message(update, context)

        assert "awaiting_bio" not in context.user_data
        skipped = context.user_data.get("skipped_profile_fields", {})
        assert "bio" in skipped
        mock_prompt.assert_called()


@pytest.mark.asyncio
async def test_handle_text_message_cancel(
    profile_module: Any, mock_update_context: tuple[MagicMock, MagicMock]
) -> None:
    """Test 'Cancel' command."""
    update, context = mock_update_context
    update.message.text = "Cancel"
    context.user_data["profile_setup_step"] = 1

    with (
        patch.object(profile_module, "clear_conversation_state") as mock_clear,
        patch.object(profile_module, "delete_media"),
    ):
        await profile_module.handle_text_message(update, context)

        mock_clear.assert_called()
        assert "profile_setup_step" not in context.user_data
        args = update.message.reply_text.call_args[0][0]
        assert "Cancelled" in args
