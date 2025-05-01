import datetime
from functools import wraps
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
import pytz
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, constants
from telegram.ext import ContextTypes

from src.bot.constants import (
    SETTINGS_MESSAGE,
)
from src.bot.handlers.settings import (
    _display_settings_menu,  # Import private function for testing
    build_age_range_keyboard,
    build_settings_keyboard,
    handle_age_range,
    handle_max_distance,
    handle_reset_settings,
    settings_callback,
    settings_command,
)
from src.models.user import Gender, Preferences, User
from src.utils.logging import get_logger

# Mock the logger setup
logger = get_logger(__name__)

# Constants for tests
USER_ID = 123
CHAT_ID = 67890


# Helper to create a mock @authenticated decorator for tests
def create_mock_authenticated_decorator(mock_user_to_inject: User):
    def decorator(func):
        @wraps(func)
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
            # Simulate decorator adding user to context
            if "user" not in context.user_data:
                context.user_data = {}  # Ensure user_data exists
            context.user_data["user"] = mock_user_to_inject
            # Call the original handler function
            return await func(update, context, *args, **kwargs)

        return wrapper

    return decorator


def mock_limiter_passthrough(func):
    """A mock decorator that simply calls the function it wraps."""

    @wraps(func)
    async def wrapper(*args, **kwargs):
        return await func(*args, **kwargs)

    return wrapper


@pytest.mark.asyncio
async def test_settings_command_success(mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User) -> None:
    """Test the /settings command successfully calls _display_settings_menu."""
    # Ensure update.message exists for the command handler
    mock_update.message = AsyncMock()
    mock_update.callback_query = None  # Command comes from message, not callback
    mock_context.user_data = {"user": mock_user}  # Setup context

    with patch("src.bot.handlers.settings._display_settings_menu") as mock_display_menu:
        # Patch get_user from the auth middleware to prevent DB call
        with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_get_user:
            # Also patch update_last_active from the auth middleware
            with patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_update_active:
                mock_get_user.return_value = mock_user
                # Call the function that the @authenticated decorator wraps
                await settings_command.__wrapped__(mock_update, mock_context)
        # Assert that _display_settings_menu was called by settings_command
        mock_display_menu.assert_awaited_once_with(mock_update, mock_context)


@pytest.mark.asyncio
async def test_settings_command_replies_message(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User
) -> None:
    """Test the /settings command replies correctly via message (line 323)."""
    mock_update.message = AsyncMock()
    mock_update.callback_query = None  # Command comes from message
    mock_update.message.reply_text = AsyncMock()
    mock_context.user_data = {"user": mock_user}  # Setup context

    # We are testing the settings_command directly, which internally calls
    # _display_settings_menu. We need to let _display_settings_menu run
    # to test the reply_text call it makes when update.message exists.
    # Patch the keyboard builder as _display_settings_menu uses it.
    with patch("src.bot.handlers.settings.build_settings_keyboard") as mock_build_keyboard:
        mock_keyboard = InlineKeyboardMarkup([[InlineKeyboardButton("Test", callback_data="test")]])
        mock_build_keyboard.return_value = mock_keyboard

        # Patch get_user from the auth middleware to prevent DB call
        with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_get_user:
            # Also patch update_last_active from the auth middleware
            with patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_update_active:
                mock_get_user.return_value = mock_user
                # Call the function that the @authenticated decorator wraps
                await settings_command.__wrapped__(mock_update, mock_context)

        # Format the expected text using user preferences
        prefs = mock_user.preferences
        expected_text = SETTINGS_MESSAGE.format(
            gender_preference=prefs.gender_preference.capitalize(),
            min_age=prefs.min_age,
            max_age=prefs.max_age,
            max_distance=prefs.max_distance,
        )

        mock_update.message.reply_text.assert_awaited_once_with(
            expected_text,
            reply_markup=mock_keyboard,
            parse_mode=constants.ParseMode.MARKDOWN,
        )
        mock_build_keyboard.assert_called_once()


@pytest.mark.asyncio
async def test_settings_command_no_user_in_context(mock_update: AsyncMock, mock_context: AsyncMock) -> None:
    """Test the /settings command handler when user is unexpectedly missing from context."""
    # Arrange
    mock_update.effective_user.id = 12345
    mock_update.message.text = "/settings"
    mock_update.message.reply_text = AsyncMock()  # Ensure awaitable
    mock_env = AsyncMock()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {}  # Simulate user missing from context

    # Act: Call the original undecorated function
    with patch("src.bot.handlers.settings.logger.error") as mock_logger_error:
        await settings_command.__wrapped__.__wrapped__(mock_update, mock_context)

    # Assert
    mock_logger_error.assert_called_once_with("User not found in context for settings_command", user_id=12345)
    mock_update.message.reply_text.assert_awaited_once_with("Could not retrieve your profile. Try /start again.")


@pytest.mark.asyncio
async def test_settings_command_no_gender_preference(mock_update: AsyncMock, mock_context: AsyncMock) -> None:
    """Test /settings command when user has no gender preference set."""
    # Arrange
    mock_update.effective_user.id = 67890
    mock_update.message.text = "/settings"
    mock_update.message.reply_text = AsyncMock()  # Ensure awaitable
    mock_env = AsyncMock()
    mock_context.bot_data = {"env": mock_env}

    mock_user = User(
        id="67890",
        telegram_id=67890,
        username="testuser2",
        full_name="Test User 2",
        birth_date=datetime.date(1995, 5, 5),
        gender=Gender.FEMALE.value,
        preferences=Preferences(
            gender_preference="any",  # <--- Key difference for this test
            min_age=20,
            max_age=30,
            max_distance=100,
        ),
        location=None,
        bio="Another bio",
        last_active=datetime.datetime.now(pytz.utc),
        created_at=datetime.datetime.now(pytz.utc),
        updated_at=datetime.datetime.now(pytz.utc),
    )
    mock_context.user_data = {"user": mock_user}

    # Act
    await settings_command.__wrapped__.__wrapped__(mock_update, mock_context)

    # Assert
    expected_text = SETTINGS_MESSAGE.format(
        gender_preference="Any",  # <--- Check for 'Any'
        min_age=mock_user.preferences.min_age,
        max_age=mock_user.preferences.max_age,
        max_distance=mock_user.preferences.max_distance,
    )

    mock_update.message.reply_text.assert_awaited_once_with(
        expected_text,
        reply_markup=ANY,  # Don't check exact markup structure here
        parse_mode=constants.ParseMode.MARKDOWN,
    )


@pytest.mark.asyncio
async def test_settings_callback_looking_for(mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User) -> None:
    """Test the settings_callback for 'settings_looking_for'."""
    mock_query = mock_update.callback_query
    mock_query.data = "settings_looking_for"

    mock_context.user_data = {"user": mock_user}
    await settings_callback.__wrapped__(mock_update, mock_context)

    mock_query.answer.assert_awaited_once()
    mock_query.edit_message_text.assert_awaited_once_with(
        "Who are you interested in meeting?",
        reply_markup=InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("Men", callback_data="looking_for_male")],
                [InlineKeyboardButton("Women", callback_data="looking_for_female")],
                [InlineKeyboardButton("Everyone", callback_data="looking_for_everyone")],
                [InlineKeyboardButton("« Back", callback_data="back_to_settings")],
            ]
        ),
    )


@pytest.mark.asyncio
async def test_settings_callback_age_range(mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User) -> None:
    """Test the settings_callback for 'settings_age_range'."""
    mock_query = mock_update.callback_query
    mock_query.data = "settings_age_range"
    mock_query.edit_message_text = AsyncMock()  # Ensure awaitable

    mock_context.user_data = {"user": mock_user}
    await settings_callback.__wrapped__(mock_update, mock_context)

    mock_query.answer.assert_awaited_once()
    mock_query.edit_message_text.assert_awaited_once()
    call_args, call_kwargs = mock_query.edit_message_text.await_args
    assert "Select the desired age range:" in call_args[0]
    assert isinstance(call_kwargs.get("reply_markup"), InlineKeyboardMarkup)


@pytest.mark.asyncio
async def test_settings_callback_max_distance(mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User) -> None:
    """Test the settings_callback for 'settings_max_distance'."""
    mock_query = mock_update.callback_query
    mock_query.data = "settings_max_distance"
    mock_query.edit_message_text = AsyncMock()  # Ensure awaitable

    mock_context.user_data = {"user": mock_user}
    await settings_callback.__wrapped__(mock_update, mock_context)

    mock_query.answer.assert_awaited_once()
    mock_query.edit_message_text.assert_awaited_once()
    call_args, call_kwargs = mock_query.edit_message_text.await_args
    assert "Select maximum distance for matches:" in call_args[0]
    assert isinstance(call_kwargs.get("reply_markup"), InlineKeyboardMarkup)


@pytest.fixture
async def mock_env():
    return AsyncMock()


@pytest.mark.asyncio
async def test_settings_callback_reset(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User, mock_env: AsyncMock
) -> None:
    """Test the settings_callback for 'settings_reset'."""
    mock_query = mock_update.callback_query
    mock_query.data = "settings_reset"
    mock_query.edit_message_text = AsyncMock()  # Ensure awaitable

    # Patch the update_preferences service function
    async def mock_reset_side_effect(env, user_id, update_data):
        # Simulate resetting the user's preferences in context
        default_prefs = Preferences()
        mock_user.preferences = default_prefs
        # Return the updated user object
        return mock_user

    # Patch build_settings_keyboard as well
    mock_keyboard = MagicMock(spec=InlineKeyboardMarkup)
    with (
        patch("src.bot.handlers.settings.build_settings_keyboard", return_value=mock_keyboard) as mock_build_keyboard,
        patch(
            "src.bot.handlers.settings.update_user", new_callable=AsyncMock, side_effect=mock_reset_side_effect
        ) as mock_update_prefs,
    ):  # Use parentheses for multiple context managers
        mock_context.bot_data["env"] = mock_env
        mock_context.user_data = {"user": mock_user}

        await settings_callback.__wrapped__(mock_update, mock_context)

    # Assertions
    mock_query.answer.assert_awaited_once()

    # Check the first call (reset confirmation)
    mock_query.edit_message_text.assert_any_call(
        "✅ Settings reset to defaults",
        reply_markup=ANY,  # Might need more specific check later
    )

    # The user object should have default prefs after reset
    default_prefs = Preferences()
    expected_settings_text = SETTINGS_MESSAGE.format(
        gender_preference="Any",  # Default display for None
        min_age=default_prefs.min_age,
        max_age=default_prefs.max_age,
        max_distance=default_prefs.max_distance,
    )

    mock_query.edit_message_text.assert_any_call(
        expected_settings_text,
        reply_markup=mock_keyboard,  # Check the mocked keyboard is used
        parse_mode=constants.ParseMode.MARKDOWN,
    )

    # Ensure edit_message_text was called exactly twice (once in handle_reset, once in _display via patch)
    assert mock_query.edit_message_text.await_count == 2
    mock_build_keyboard.assert_called_once()  # Verify keyboard was built
    expected_reset_prefs = {
        "preferences": {
            "gender_preference": "any",
            "min_age": 18,
            "max_age": 100,
            "max_distance": 50,
        }
    }
    mock_update_prefs.assert_awaited_once_with(mock_context.bot_data["env"], "123", expected_reset_prefs)


@pytest.mark.asyncio
async def test_settings_callback_back(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User, mock_env: AsyncMock
) -> None:
    """Test the settings_callback for 'back_to_settings'."""
    mock_query = mock_update.callback_query
    mock_query.data = "back_to_settings"
    mock_user.preferences = Preferences(gender_preference="female", min_age=25, max_age=35, max_distance=50)

    mock_context.bot_data["env"] = mock_env
    mock_context.user_data = {"user": mock_user}
    await settings_callback.__wrapped__(mock_update, mock_context)

    mock_query.answer.assert_awaited_once()
    mock_query.edit_message_text.assert_awaited_once_with(
        SETTINGS_MESSAGE.format(
            gender_preference=mock_user.preferences.gender_preference.capitalize(),
            min_age=mock_user.preferences.min_age,
            max_age=mock_user.preferences.max_age,
            max_distance=mock_user.preferences.max_distance,
        ),
        reply_markup=ANY,  # Don't check exact markup structure here
        parse_mode=constants.ParseMode.MARKDOWN,  # Align with actual handler code
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "callback_data, expected_gender",
    [
        ("looking_for_male", Gender.MALE),
        ("looking_for_female", Gender.FEMALE),
        ("looking_for_everyone", None),  # Representing ANY/None
    ],
)
async def test_handle_looking_for_callback(
    callback_data: str,
    expected_gender: Gender | None,
    mock_update: AsyncMock,
    mock_user: User,
    mock_context: AsyncMock,
    mock_env: AsyncMock,
) -> None:
    """Test handling looking_for callbacks."""
    mock_query = mock_update.callback_query
    mock_query.data = callback_data
    mock_query.edit_message_text = AsyncMock()

    # Create a user instance with some initial preferences
    original_prefs = Preferences(gender_preference=Gender.MALE.value)

    mock_user = User(
        id="user1",
        telegram_id=USER_ID,
        username="testuser",
        full_name="Test User",
        birth_date=datetime.date(1990, 1, 1),
        gender=Gender.MALE.value,  # Set an initial gender
        preferences=original_prefs,
        location=None,
        bio="Test bio",
        last_active=datetime.datetime.now(pytz.utc),
        created_at=datetime.datetime.now(pytz.utc),
        updated_at=datetime.datetime.now(pytz.utc),
    )

    # Patch the update_preferences service function
    async def mock_update_side_effect(env, user_id, update_data):
        # Simulate updating the user's preferences in context
        new_pref_value = update_data.get("preferences", {}).get("gender_preference")
        mock_user.preferences.gender_preference = new_pref_value
        # Return the updated user object (or just the relevant part)
        return mock_user

    with patch(
        "src.bot.handlers.settings.update_user", new_callable=AsyncMock, side_effect=mock_update_side_effect
    ) as mock_update_prefs:
        # Patch _display_settings_menu to prevent its edit call interfering
        with patch("src.bot.handlers.settings._display_settings_menu", new_callable=AsyncMock) as mock_display_menu:
            mock_context.bot_data["env"] = mock_env
            mock_context.user_data = {"user": mock_user}
            await settings_callback.__wrapped__(mock_update, mock_context)

            mock_display_menu.assert_awaited_once_with(mock_update, mock_context, query=mock_query)

    mock_query.answer.assert_awaited_once()
    mock_update_prefs.assert_awaited_once_with(
        mock_context.bot_data["env"],
        "123",
        {"preferences": {"gender_preference": expected_gender.value if expected_gender else None}},
    )
    assert mock_query.edit_message_text.await_count == 1  # Only the confirmation edit


# --- Age Range Tests ---
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "callback_data, expected_min_age",
    [
        ("min_age_18", 18),
        ("min_age_26", 26),
        ("min_age_46", 46),
    ],
)
async def test_handle_set_min_age_callback(
    mock_update: AsyncMock,
    mock_user: User,
    mock_context: AsyncMock,
    callback_data: str,
    expected_min_age: int,
    mock_env: AsyncMock,
) -> None:
    """Test the callback for setting MINIMUM age preference."""
    mock_query = mock_update.callback_query
    mock_query.data = callback_data
    mock_query.edit_message_text = AsyncMock()  # Ensure awaitable

    original_prefs = Preferences(min_age=20, max_age=30)
    mock_user = User(
        id="user1",
        telegram_id=USER_ID,
        username="testuser",
        full_name="Test User",
        birth_date=datetime.date(1990, 1, 1),
        gender=Gender.MALE.value,
        preferences=original_prefs,
        location=None,
        bio="Test bio",
        last_active=datetime.datetime.now(pytz.utc),
        created_at=datetime.datetime.now(pytz.utc),
        updated_at=datetime.datetime.now(pytz.utc),
    )

    # Mock update_user to return the updated user
    with patch("src.bot.handlers.settings.update_user", new_callable=AsyncMock) as mock_update_prefs:
        mock_update_prefs.return_value = mock_user.model_copy(
            deep=True, update={"preferences": original_prefs.model_copy(update={"min_age": expected_min_age})}
        )

        # Patch _display_settings_menu to prevent its edit call interfering
        with patch("src.bot.handlers.settings._display_settings_menu", new_callable=AsyncMock) as mock_display_menu:
            mock_context.bot_data["env"] = mock_env
            mock_context.user_data = {"user": mock_user}
            await settings_callback.__wrapped__(mock_update, mock_context)

            mock_display_menu.assert_awaited_once_with(mock_update, mock_context, query=mock_query)

    mock_query.answer.assert_awaited_once()
    update_data = {"preferences": {"min_age": expected_min_age}}  # Correct format
    mock_update_prefs.assert_awaited_once_with(mock_context.bot_data["env"], "123", update_data)
    assert mock_query.edit_message_text.await_count == 1  # Only the confirmation edit


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "callback_data, expected_max_age",
    [
        ("max_age_35", 35),
        ("max_age_50", 50),
        ("max_age_100", 100),
    ],
)
async def test_handle_set_max_age_callback(
    mock_update: AsyncMock,
    mock_user: User,
    mock_context: AsyncMock,
    callback_data: str,
    expected_max_age: int,
    mock_env: AsyncMock,
) -> None:
    """Test the callback for setting MAXIMUM age preference."""
    mock_query = mock_update.callback_query
    mock_query.data = callback_data
    mock_query.edit_message_text = AsyncMock()  # Ensure awaitable

    original_prefs = Preferences(min_age=20, max_age=30)
    mock_user = User(
        id="user1",
        telegram_id=USER_ID,
        username="testuser",
        full_name="Test User",
        birth_date=datetime.date(1990, 1, 1),
        gender=Gender.MALE.value,
        preferences=original_prefs,
        location=None,
        bio="Test bio",
        last_active=datetime.datetime.now(pytz.utc),
        created_at=datetime.datetime.now(pytz.utc),
        updated_at=datetime.datetime.now(pytz.utc),
    )

    # Mock update_user to return the updated user
    with patch("src.bot.handlers.settings.update_user", new_callable=AsyncMock) as mock_update_prefs:
        mock_update_prefs.return_value = mock_user.model_copy(
            deep=True, update={"preferences": original_prefs.model_copy(update={"max_age": expected_max_age})}
        )

        # Patch _display_settings_menu to prevent its edit call interfering
        with patch("src.bot.handlers.settings._display_settings_menu", new_callable=AsyncMock) as mock_display_menu:
            mock_context.bot_data["env"] = mock_env
            mock_context.user_data = {"user": mock_user}
            await settings_callback.__wrapped__(mock_update, mock_context)

            mock_display_menu.assert_awaited_once_with(mock_update, mock_context, query=mock_query)

    mock_query.answer.assert_awaited_once()
    update_data = {"preferences": {"max_age": expected_max_age}}  # Correct format
    mock_update_prefs.assert_awaited_once_with(mock_context.bot_data["env"], "123", update_data)
    assert mock_query.edit_message_text.await_count == 1  # Only the confirmation edit


# --- Max Distance Tests ---
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "callback_data, expected_max_distance",
    [
        ("max_distance_50", 50),
        ("max_distance_100", 100),
        ("max_distance_200", 200),
    ],
)
async def test_handle_max_distance_callback(
    mock_update: AsyncMock,
    mock_user: User,
    mock_context: AsyncMock,
    callback_data: str,
    expected_max_distance: int,
    mock_env: AsyncMock,
) -> None:
    """Test the callback for setting max distance preference."""
    mock_query = mock_update.callback_query
    mock_query.data = callback_data
    mock_query.edit_message_text = AsyncMock()  # Ensure awaitable

    original_prefs = Preferences(max_distance=25)
    mock_user = User(
        id="user1",
        telegram_id=USER_ID,
        username="testuser",
        full_name="Test User",
        birth_date=datetime.date(1990, 1, 1),
        gender=Gender.MALE.value,
        preferences=original_prefs,
        location=None,
        bio="Test bio",
        last_active=datetime.datetime.now(pytz.utc),
        created_at=datetime.datetime.now(pytz.utc),
        updated_at=datetime.datetime.now(pytz.utc),
    )

    # Use return_value again, now that handler logic is confirmed
    with patch("src.bot.handlers.settings.update_user", new_callable=AsyncMock) as mock_update_prefs:
        mock_update_prefs.return_value = mock_user.model_copy(
            deep=True, update={"preferences": original_prefs.model_copy(update={"max_distance": expected_max_distance})}
        )

        # Patch _display_settings_menu to prevent its edit call interfering
        with patch("src.bot.handlers.settings._display_settings_menu", new_callable=AsyncMock) as mock_display_menu:
            mock_context.bot_data["env"] = mock_env
            mock_context.user_data = {"user": mock_user}
            await settings_callback.__wrapped__(mock_update, mock_context)

            mock_display_menu.assert_awaited_once_with(mock_update, mock_context, query=mock_query)

    mock_query.answer.assert_awaited_once()
    update_data = {"preferences": {"max_distance": expected_max_distance}}  # Correct format
    mock_update_prefs.assert_awaited_once_with(mock_context.bot_data["env"], "123", update_data)
    assert mock_query.edit_message_text.await_count == 1  # Only the confirmation edit


@pytest.mark.asyncio
async def test_handle_max_distance_callback_invalid_data(
    mock_update: AsyncMock,
    mock_user: User,
    mock_context: AsyncMock,
    mock_env: AsyncMock,
) -> None:
    """Test max distance callback with invalid data prefix."""
    mock_query = mock_update.callback_query
    mock_query.data = "invalid_prefix_100"  # Invalid prefix
    mock_query.edit_message_text = AsyncMock()
    mock_context.bot_data["env"] = mock_env
    mock_context.user_data = {"user": mock_user}

    with (
        patch("src.bot.handlers.settings.logger.warning") as mock_logger_warning,
        patch("src.bot.handlers.settings.update_user", new_callable=AsyncMock) as mock_update_user,
        patch("src.bot.handlers.settings._display_settings_menu", new_callable=AsyncMock) as mock_display_menu,
    ):
        await settings_callback.__wrapped__(mock_update, mock_context)

        mock_query.answer.assert_awaited_once()
        mock_logger_warning.assert_not_called()
        mock_query.edit_message_text.assert_not_awaited()
        mock_update_user.assert_not_awaited()
        mock_display_menu.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_max_distance_callback_parse_error(
    mock_update: AsyncMock,
    mock_user: User,
    mock_context: AsyncMock,
    mock_env: AsyncMock,
) -> None:
    """Test max distance callback when data suffix isn't an integer."""
    mock_query = mock_update.callback_query
    mock_query.data = "max_distance_invalid"  # Invalid suffix
    mock_query.edit_message_text = AsyncMock()
    mock_context.bot_data["env"] = mock_env
    mock_context.user_data = {"user": mock_user}

    with (
        patch("src.bot.handlers.settings.logger.error") as mock_logger_error,
        patch("src.bot.handlers.settings.update_user", new_callable=AsyncMock) as mock_update_user,
        patch("src.bot.handlers.settings._display_settings_menu", new_callable=AsyncMock) as mock_display_menu,
    ):
        await settings_callback.__wrapped__(mock_update, mock_context)

        mock_query.answer.assert_awaited_once()
        mock_logger_error.assert_called_once_with(
            "Error in settings callback",
            user_id=str(mock_update.effective_user.id),  # Use actual user_id
            callback_data="max_distance_invalid",
            error=ANY,  # Expecting AttributeError details here
            exc_info=ANY,
        )
        mock_query.edit_message_text.assert_awaited_with(
            "Sorry, something went wrong. Please try again with /settings."
        )
        mock_update_user.assert_not_awaited()
        mock_display_menu.assert_not_awaited()


# --- New Tests ---


@pytest.mark.asyncio
async def test_settings_callback_back_to_settings_no_preferences(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User
) -> None:
    """Test settings_callback with 'back_to_settings' when user.preferences is None."""
    mock_user.preferences = None  # Set preferences to None
    mock_context.user_data = {"user": mock_user}
    mock_query = mock_update.callback_query
    mock_query.data = "back_to_settings"
    mock_query.edit_message_text = AsyncMock()

    # Patch build_settings_keyboard which is called by _display_settings_menu
    with patch("src.bot.handlers.settings.build_settings_keyboard") as mock_build_keyboard:
        # Call the settings_callback (which internally calls _display_settings_menu)
        await settings_callback.__wrapped__(mock_update, mock_context)

        # Assert _display_settings_menu correctly formatted text with defaults
        expected_text = """
⚙️ *Settings*

Adjust your matching preferences below:

*Current preferences:*
🔍 Looking for: Any
📏 Age range: Not set-Not set
📍 Max distance: Not set km

Select an option to change:
"""
        mock_query.edit_message_text.assert_awaited_once_with(
            expected_text,
            reply_markup=mock_build_keyboard.return_value,
            parse_mode=constants.ParseMode.MARKDOWN,  # Use the constant
        )
        mock_build_keyboard.assert_called_once()


@pytest.mark.asyncio
async def test_handle_age_range_exception(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_env: AsyncMock, mock_user: User
) -> None:
    """Test handle_age_range exception handling."""
    mock_query = mock_update.callback_query
    mock_query.edit_message_text = AsyncMock()
    mock_context.bot_data["env"] = mock_env
    mock_context.user_data = {"user": mock_user}
    test_exception = Exception("DB Error")

    with (
        patch("src.bot.handlers.settings.update_user", side_effect=test_exception) as mock_update_user,
        patch("src.bot.handlers.settings.logger.error") as mock_logger_error,
        patch("src.bot.handlers.settings._display_settings_menu") as mock_display_menu,
    ):  # Prevent display menu call
        await handle_age_range(mock_update, mock_context, "min", 25)

        mock_update_user.assert_awaited_once()
        mock_logger_error.assert_called_once_with(
            "Error updating age preference",
            user_id=str(mock_update.effective_user.id),
            age_type="min",
            age_value=25,
            error=str(test_exception),
            exc_info=test_exception,
        )
        mock_query.edit_message_text.assert_awaited_once_with("Sorry, something went wrong. Please try again.")
        mock_display_menu.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_max_distance_exception(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_env: AsyncMock, mock_user: User
) -> None:
    """Test handle_max_distance exception handling."""
    mock_query = mock_update.callback_query
    mock_query.edit_message_text = AsyncMock()
    mock_context.bot_data["env"] = mock_env
    mock_context.user_data = {"user": mock_user}
    test_exception = Exception("DB Error")

    with (
        patch("src.bot.handlers.settings.update_user", side_effect=test_exception) as mock_update_user,
        patch("src.bot.handlers.settings.logger.error") as mock_logger_error,
        patch("src.bot.handlers.settings._display_settings_menu") as mock_display_menu,
    ):  # Prevent display menu call
        await handle_max_distance(mock_update, mock_context, 50)

        mock_update_user.assert_awaited_once()
        mock_logger_error.assert_called_once_with(
            "Error updating max distance",
            user_id=str(mock_update.effective_user.id),
            distance=50,
            error=str(test_exception),
            exc_info=test_exception,
        )
        mock_query.edit_message_text.assert_awaited_once_with("Sorry, something went wrong. Please try again.")
        mock_display_menu.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_reset_settings_exception(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_env: AsyncMock, mock_user: User
) -> None:
    """Test handle_reset_settings exception handling."""
    mock_query = mock_update.callback_query
    mock_query.edit_message_text = AsyncMock()
    mock_context.bot_data["env"] = mock_env
    mock_context.user_data = {"user": mock_user}
    test_exception = Exception("DB Error")

    with (
        patch("src.bot.handlers.settings.update_user", side_effect=test_exception) as mock_update_user,
        patch("src.bot.handlers.settings.logger.error") as mock_logger_error,
        patch("src.bot.handlers.settings._display_settings_menu") as mock_display_menu,
    ):  # Prevent display menu call
        await handle_reset_settings(mock_update, mock_context)

        mock_update_user.assert_awaited_once()
        mock_logger_error.assert_called_once_with(
            "Error resetting settings",
            user_id=str(mock_update.effective_user.id),
            error=str(test_exception),
            exc_info=test_exception,
        )
        mock_query.edit_message_text.assert_awaited_once_with("Sorry, something went wrong. Please try again.")
        mock_display_menu.assert_not_awaited()


def test_build_age_range_keyboard() -> None:
    """Test the build_age_range_keyboard helper function."""
    keyboard = build_age_range_keyboard()

    assert isinstance(keyboard, InlineKeyboardMarkup)
    assert len(keyboard.inline_keyboard) == 4  # Check number of rows
    # Check some specific buttons
    assert keyboard.inline_keyboard[0][0].text == "Min: 18+"
    assert keyboard.inline_keyboard[0][0].callback_data == "min_age_18"
    assert keyboard.inline_keyboard[2][1].text == "Max: -50"
    assert keyboard.inline_keyboard[2][1].callback_data == "max_age_50"
    assert keyboard.inline_keyboard[3][0].text == "« Back"
    assert keyboard.inline_keyboard[3][0].callback_data == "back_to_settings"


@pytest.mark.asyncio
async def test_settings_callback_invalid_age_range_data(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User
) -> None:
    """Test settings_callback with invalid age range callback data causing ValueError."""
    mock_query = mock_update.callback_query
    mock_query.data = "min_age_invalid"  # Data that won't parse correctly
    mock_query.edit_message_text = AsyncMock()
    mock_context.user_data = {"user": mock_user}

    with (
        patch("src.bot.handlers.settings.logger.error") as mock_logger_error,
        patch("src.bot.handlers.settings.handle_age_range") as mock_handle_age_range,
    ):
        # Call settings_callback directly (skipping decorators for focused test)
        await settings_callback.__wrapped__(mock_update, mock_context)

        # Assert that the generic error handler logged the error
        mock_logger_error.assert_called_once_with(
            "Error in settings callback",
            user_id=str(mock_update.effective_user.id),
            callback_data="min_age_invalid",
            error=ANY,  # Expecting error string containing ValueError details
            exc_info=ANY,
        )
        # Verify the actual exception type caught was ValueError
        args, kwargs = mock_logger_error.call_args
        assert isinstance(kwargs.get("exc_info"), ValueError)
        # Assert the correct message was sent
        mock_query.edit_message_text.assert_awaited_once_with(
            "Sorry, something went wrong. Please try again with /settings."
        )
        # Ensure the actual handler function wasn't called
        mock_handle_age_range.assert_not_awaited()


@pytest.mark.asyncio
async def test_display_settings_menu_no_user_in_context(mock_update: AsyncMock, mock_context: AsyncMock) -> None:
    """Test _display_settings_menu when user is not in context.user_data (lines 65-71)."""
    mock_context.user_data = {}  # No user in context
    mock_update.callback_query = None  # Ensure it's called via message
    mock_update.message = AsyncMock()
    mock_update.message.reply_text = AsyncMock()

    with patch("src.bot.handlers.settings.logger.error") as mock_logger_error:
        # Call the function directly
        await _display_settings_menu(mock_update, mock_context)

        # Assert logger was called
        mock_logger_error.assert_called_once_with(
            "User not found in context for _display_settings_menu", user_id=mock_update.effective_user.id
        )
        # Assert error message was replied
        mock_update.message.reply_text.assert_awaited_once_with("Could not retrieve your profile. Try /start again.")


@pytest.mark.asyncio
async def test_settings_callback_handles_looking_for(
    mock_update: AsyncMock, mock_context: AsyncMock, mock_user: User
) -> None:
    """Test settings_callback handles 'looking_for_' prefix (lines 253-261)."""
    mock_context.user_data = {"user": mock_user}
    mock_query = mock_update.callback_query
    mock_query.data = "looking_for_female"  # Example looking_for data
    mock_query.answer = AsyncMock()

    # Patch the specific handler function called by this branch
    with patch("src.bot.handlers.settings.handle_looking_for", new_callable=AsyncMock) as mock_handle_looking_for:
        await settings_callback.__wrapped__(mock_update, mock_context)

        # Assert query was answered
        mock_query.answer.assert_awaited_once()
        # Assert the correct handler was called with the extracted value
        mock_handle_looking_for.assert_awaited_once_with(mock_update, mock_context, "female")


@pytest.mark.asyncio
async def test_settings_callback_handles_age_range(
    mock_update: AsyncMock,
    mock_context: AsyncMock,
    mock_user: User,
) -> None:
    """Test the settings_callback for 'settings_age_range'."""
    mock_query = mock_update.callback_query
    mock_query.data = "settings_age_range"
    mock_query.edit_message_text = AsyncMock()  # Ensure awaitable

    mock_context.user_data = {"user": mock_user}
    await settings_callback.__wrapped__(mock_update, mock_context)

    mock_query.answer.assert_awaited_once()
    mock_query.edit_message_text.assert_awaited_once()
    call_args, call_kwargs = mock_query.edit_message_text.await_args
    assert "Select the desired age range:" in call_args[0]
    assert isinstance(call_kwargs.get("reply_markup"), InlineKeyboardMarkup)
