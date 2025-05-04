from datetime import date
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import User as TelegramUser

from src.bot.handlers import profile as profile_handlers
from src.bot.handlers.profile import (
    AGE_UPDATE_MESSAGE,
    BIO_UPDATE_MESSAGE,
    GENDER_UPDATE_MESSAGE,
    NAME_UPDATE_MESSAGE,
)
from src.models import User
from src.services.user_service import NotFoundError, ValidationError
from tests.conftest import MockEnv

# Mock data for geocoding
MOCK_GEOCODED_DATA = {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "New York, NY, USA",
}

# Define the structure of the mock user data returned by the DB
MOCK_USER_DB_ROW = {
    "id": "12345",
    "telegram_id": 12345,
    "username": "testuser",
    "full_name": "Mock DB User",
    "bio": "DB bio",
    "birth_date": date(1990, 1, 1),
    "gender": "prefer not to say",
    "is_active": True,
    "is_banned": False,
    "is_profile_complete": False,
    "created_at": date(2024, 1, 1),
    "last_login_at": date(2024, 1, 1),
    "latitude": 0.0,
    "longitude": 0.0,
    "age": 34,
    "location": None,
    "preferences": None,
    "photos": [],
    "interests": [],
}

# Mock KV store
mock_kv_store = AsyncMock()
mock_kv_store.get.return_value = None


# Helper function to set up common mock context
def setup_mock_context(
    mock_context: MagicMock,
    mock_update: AsyncMock,
    mock_env: MockEnv,
    mock_user: User | None = None,
    args: list[str] | None = None,
) -> None:
    """Helper to configure mock context and bot_data."""
    # Set env for the @authenticated decorator (even if mocked, good practice)
    mock_context.bot_data = {"env": mock_env}

    # Set env within application.bot_data as used by handlers
    mock_context.application = MagicMock()
    mock_context.application.bot_data = {"env": mock_env}
    mock_context.args = args if args is not None else []

    # Ensure effective_user is set on the mock_update object
    if mock_user:
        # Create a mock TelegramUser from the User model data
        mock_telegram_user = MagicMock(spec=TelegramUser)
        mock_telegram_user.id = mock_user.telegram_id
        mock_telegram_user.first_name = mock_user.full_name.split()[0] if mock_user.full_name else "Test"
        mock_telegram_user.username = mock_user.username
        mock_update.effective_user = mock_telegram_user
        mock_context.user_data = {"user": mock_user}  # Store user in context
    else:
        mock_update.effective_user = None  # Ensure it's None if no user
        mock_context.user_data = {}


# --- Mock Rate Limiter Logic ---
async def mock_check_rate_limit(*args: Any, **kwargs: Any) -> tuple[bool, int]:
    """Mock function to bypass rate limit check, always returns allowed."""
    return True, 0


# Common patch for the rate limiter - Patch the check method directly
RATE_LIMITER_PATCH = patch("src.utils.rate_limiter.RateLimiter.check_rate_limit", new=mock_check_rate_limit)


# --- Tests for profile_command ---
@pytest.mark.asyncio
async def test_profile_command_success(
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
) -> None:
    """Test profile_command displays profile correctly when user is authenticated."""
    # Arrange
    mock_context.user_data["user"] = mock_user

    expected_text = (
        "\n👤 *Your Profile*\n\n"
        f"*Name:* {mock_user.full_name or 'Not set'}\n"
        f"*Age:* {mock_user.age or 'Not set'}\n"
        f"*Gender:* {mock_user.gender.capitalize() if mock_user.gender else 'Not specified'}\n"
        f"*Bio:* {mock_user.bio or 'Not set'}\n\n"
    )

    # Act and Assert within patch contexts
    with (
        patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_get_user,
        patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_update_active,
        patch("src.bot.middleware.auth.logger") as mock_auth_logger,
        patch("src.bot.handlers.profile.logger") as mock_handler_logger,
    ):
        mock_get_user.return_value = mock_user  # Configure mock inside 'with'

        await profile_handlers.profile_command(mock_update, mock_context)

        # Assertions remain largely the same, using mocks from 'with'
        mock_get_user.assert_awaited_once()
        mock_update_active.assert_awaited_once()
        mock_handler_logger.error.assert_not_called()
        mock_update.message.reply_text.assert_awaited_once_with(expected_text, parse_mode="Markdown")
        mock_auth_logger.warning.assert_not_called()
        mock_auth_logger.error.assert_not_called()


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.middleware.auth.get_user", side_effect=NotFoundError("Not found"))
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)  # Still patch this
async def test_profile_command_no_user_in_context(
    mock_update_active: AsyncMock,
    mock_get_user: AsyncMock,
    mock_update: AsyncMock,
    mock_context: MagicMock,
) -> None:
    """Test profile_command handles NotFoundError from decorator's get_user."""
    # Arrange
    mock_context.user_data = {}  # Start with empty context
    # mock_get_user raises NotFoundError

    # Act
    await profile_handlers.profile_command(mock_update, mock_context)

    # Assert
    mock_update.effective_message.reply_text.assert_awaited_once_with(
        "Please register first by using the /start command."
    )


@pytest.mark.asyncio
async def test_profile_command_generic_exception(
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,  # Keep mock_user fixture
) -> None:
    """Test profile_command handles generic exceptions correctly."""
    # Arrange
    error_message = "Error during formatting"
    expected_reply = "An error occurred fetching your profile."

    # Patch the handler's logger and the template variable itself
    with (
        patch("src.bot.handlers.profile.logger") as mock_handler_logger,
        patch("src.bot.handlers.profile.PROFILE_MESSAGE_TEMPLATE", new_callable=MagicMock) as mock_template,
    ):
        # Configure the mock template's format method to raise the error
        mock_template.format.side_effect = Exception(error_message)

        mock_context.user_data["user"] = mock_user  # Ensure user is set for the handler

        # Patch decorator dependencies inside a nested block
        with (
            patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_get_user,
            patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_update_active,
            patch("src.bot.middleware.auth.logger") as mock_auth_logger,
        ):
            # Decorator succeeds
            mock_get_user.return_value = mock_user

            # Act
            await profile_handlers.profile_command(mock_update, mock_context)

            # Assertions
            mock_get_user.assert_awaited_once()
            mock_update_active.assert_awaited_once()
            # Assert handler logger call
            mock_handler_logger.error.assert_called_once()
            # Assert reply text
            mock_update.message.reply_text.assert_awaited_once_with(expected_reply)
            # Assert auth logger NOT called for errors
            mock_auth_logger.warning.assert_not_called()
            mock_auth_logger.error.assert_not_called()


# --- Tests for name_command ---
@pytest.mark.asyncio
@RATE_LIMITER_PATCH
# Don't patch the decorator itself, patch its internal calls
# @patch("src.bot.middleware.auth.authenticated", new=mock_authenticated_decorator)
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch("src.bot.handlers.profile.is_valid_name", return_value=True)
async def test_name_command_success(
    mock_is_valid: MagicMock,
    mock_handler_update_user: AsyncMock,  # Add type hint
    # Mocks for auth patches will be created inside the test
    # mock_decorator_get_user: AsyncMock,
    # mock_decorator_update_last_active: AsyncMock,
    # Fixtures remain the same
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test name_command successfully updates the name."""
    # Arrange
    test_name = "Valid Name"
    mock_context.args = test_name.split()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/name {test_name}"  # Align message.text with the command and args

    # Patch auth dependencies using context managers
    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        # Configure the mock for get_user called by the decorator
        mock_decorator_get_user.return_value = mock_user  # Ensure decorator gets the user

        # Act
        await profile_handlers.name_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()  # Check decorator called get_user
        mock_decorator_update_last_active.assert_called_once()  # Check decorator called update_last_active
        mock_is_valid.assert_called_once_with(test_name)  # Check handler called is_valid_name
        mock_handler_update_user.assert_called_once_with(
            mock_env, mock_user.id, {"full_name": test_name}
        )  # Check handler called update_user
        mock_update.effective_message.reply_text.assert_called_once_with(
            f"Name updated to: {test_name}"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
# Use context managers for auth patches
async def test_name_command_missing_argument(
    # Mocks for auth patches will be created inside the test
    # mock_decorator_get_user: AsyncMock,
    # mock_decorator_update_last_active: AsyncMock,
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test name_command replies with usage message when no name is provided."""
    # Arrange
    mock_context.args = []  # No arguments
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = "/name"  # Set message text

    # Patch auth dependencies using context managers
    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.name_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            NAME_UPDATE_MESSAGE  # Expect the usage message constant
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
# Use context managers for auth patches
@patch("src.bot.handlers.profile.is_valid_name", return_value=False)  # Mock validation to return False
async def test_name_command_invalid_name(
    mock_is_valid: MagicMock,
    # mock_decorator_get_user: AsyncMock,
    # mock_decorator_update_last_active: AsyncMock,
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test name_command replies appropriately when the name is invalid."""
    # Arrange
    invalid_name = "Invalid@Name123"
    mock_context.args = [invalid_name]  # Pass single arg for split logic
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/name {invalid_name}"  # Add message.text

    # Patch auth dependencies using context managers
    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.name_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_is_valid.assert_called_once_with(invalid_name)
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            f"{invalid_name} is not a valid name. Please use only letters and spaces."
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
# Use context managers for auth patches
@patch("src.bot.handlers.profile.update_user", side_effect=ValidationError("Service validation failed"))
@patch("src.bot.handlers.profile.is_valid_name", return_value=True)
async def test_name_command_service_validation_error(
    mock_is_valid: MagicMock,
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    # mock_decorator_get_user: AsyncMock,
    # mock_decorator_update_last_active: AsyncMock,
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test name_command handles ValidationError from update_user service."""
    # Arrange
    test_name = "Valid Name"
    error_message = "Service validation failed"
    mock_context.args = test_name.split()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/name {test_name}"  # Add message.text

    # Patch auth dependencies using context managers
    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.name_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_is_valid.assert_called_once_with(test_name)
        mock_handler_update_user.assert_called_once()  # Check it was called
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
# Use context managers for auth patches
@patch("src.bot.handlers.profile.update_user", side_effect=NotFoundError("Service not found"))
@patch("src.bot.handlers.profile.is_valid_name", return_value=True)
async def test_name_command_service_not_found_error(
    mock_is_valid: MagicMock,
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    # mock_decorator_get_user: AsyncMock,
    # mock_decorator_update_last_active: AsyncMock,
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test name_command handles NotFoundError from update_user service."""
    # Arrange
    test_name = "Valid Name"
    error_message = "Could not find your profile. Please try /start again."
    mock_context.args = test_name.split()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/name {test_name}"  # Add message.text

    # Patch auth dependencies using context managers
    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.name_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_is_valid.assert_called_once_with(test_name)
        mock_handler_update_user.assert_called_once()  # Check it was called
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
# Use context managers for auth patches
@patch("src.bot.handlers.profile.update_user", side_effect=Exception("Service generic error"))
@patch("src.bot.handlers.profile.is_valid_name", return_value=True)
async def test_name_command_service_generic_error(
    mock_is_valid: MagicMock,
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    # mock_decorator_get_user: AsyncMock,
    # mock_decorator_update_last_active: AsyncMock,
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test name_command handles generic Exception from update_user service."""
    # Arrange
    test_name = "Valid Name"
    error_message = "An unexpected error occurred while updating your name."
    mock_context.args = test_name.split()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/name {test_name}"  # Add message.text

    # Patch auth dependencies using context managers
    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.name_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_is_valid.assert_called_once_with(test_name)
        mock_handler_update_user.assert_called_once()  # Check it was called
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)

# --- Age Command Tests ---


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
async def test_age_command_success(
    mock_handler_update_user: AsyncMock,  # Add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test age_command successfully updates the age."""
    # Arrange
    test_age = 30
    mock_context.args = [str(test_age)]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/age {test_age}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.age_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        # Calculate expected birth_date based on today's date
        expected_birth_date = date.today().replace(year=date.today().year - int(test_age))
        mock_handler_update_user.assert_awaited_once_with(
            mock_env, mock_user.id, {"birth_date": expected_birth_date}
        )
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            f"Age updated to: {test_age}"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
async def test_age_command_missing_argument(
    mock_update: AsyncMock,  # Add type hints
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test age_command replies with usage message when no age is provided."""
    # Arrange
    mock_context.args = []
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = "/age"  # Set message text to fix TypeError

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.age_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            AGE_UPDATE_MESSAGE  # Expect the usage message constant
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
async def test_age_command_invalid_age_range(
    mock_update: AsyncMock,  # Add type hints
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test age_command replies appropriately for age outside the valid range."""
    # Arrange
    invalid_age = 17  # Example invalid age
    mock_context.args = [str(invalid_age)]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/age {invalid_age}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.age_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            f"Invalid age: {invalid_age}. Age must be between 18 and 100.\nUsage: {AGE_UPDATE_MESSAGE}"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=ValidationError("Service age validation failed"))
async def test_age_command_service_validation_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test age_command handles ValidationError from update_user service."""
    # Arrange
    test_age = 30
    error_message = "Service age validation failed"
    mock_context.args = [str(test_age)]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/age {test_age}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.age_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            f"Validation error: {error_message}"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=Exception("Generic age error"))
async def test_age_command_service_generic_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test age_command handles generic Exception from update_user service."""
    # Arrange
    test_age = 30
    error_message = "Sorry, something went wrong while updating your age. Please try again later."
    mock_context.args = [str(test_age)]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/age {test_age}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.age_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)

# --- Bio Command Tests --- #

@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
async def test_bio_command_success(
    mock_handler_update_user: AsyncMock,  # Add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test bio_command successfully updates the bio."""
    # Arrange
    test_bio = "This is a test bio."
    mock_context.args = test_bio.split()  # Split bio for args
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/bio {test_bio}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.bio_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once_with(
            mock_env, mock_user.id, {"bio": test_bio}  # Expect the full bio string
        )
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            "Bio updated successfully!"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
async def test_bio_command_missing_argument(
    mock_update: AsyncMock,  # Add type hints
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test bio_command replies with usage message when no bio is provided."""
    # Arrange
    mock_context.args = []
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = "/bio"  # Set message text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.bio_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            BIO_UPDATE_MESSAGE  # Expect the usage message constant
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=ValidationError("Bio validation failed"))
async def test_bio_command_service_validation_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test bio_command handles ValidationError from update_user service."""
    # Arrange
    test_bio = "Test bio"
    error_message = "Bio validation failed"
    mock_context.args = test_bio.split()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/bio {test_bio}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.bio_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            f"Validation error: {error_message}"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=NotFoundError("Bio user not found"))
async def test_bio_command_service_not_found_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test bio_command handles NotFoundError from update_user service."""
    # Arrange
    test_bio = "Test bio"
    error_message = "Could not find your profile. Please try /start again."
    mock_context.args = test_bio.split()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/bio {test_bio}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.bio_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=Exception("Generic bio error"))
async def test_bio_command_service_generic_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test bio_command handles generic Exception from update_user service."""
    # Arrange
    test_bio = "Another bio test"
    error_message = "Sorry, something went wrong while updating your bio. Please try again later."
    mock_context.args = test_bio.split()
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/bio {test_bio}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.bio_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)

# --- Gender Command Tests --- #

@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
async def test_gender_command_success(
    mock_handler_update_user: AsyncMock,  # Add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test gender_command updates user gender successfully."""
    # Arrange
    test_gender = "female"
    mock_context.args = [test_gender]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/gender {test_gender}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.gender_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once_with(
            mock_env, mock_user.id, {"gender": test_gender}
        )
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            f"Gender updated to: {test_gender}"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
async def test_gender_command_missing_argument(
    mock_update: AsyncMock,  # Add type hints
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test gender_command handles missing gender argument."""
    # Arrange
    mock_context.args = []
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = "/gender"  # Set message text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.gender_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            GENDER_UPDATE_MESSAGE  # Use constant
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
async def test_gender_command_invalid_argument(
    mock_update: AsyncMock,  # Add type hints
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test gender_command handles invalid gender argument."""
    # Arrange
    invalid_gender = "invalid_choice"
    mock_context.args = [invalid_gender]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/gender {invalid_gender}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.gender_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        valid_options = ", ".join(g.value for g in Gender)
        expected_reply = (
            f"Invalid gender: '{invalid_gender}'. Please use one of: {valid_options}.\nUsage: {GENDER_UPDATE_MESSAGE}"
        )
        mock_update.effective_message.reply_text.assert_awaited_once_with(expected_reply)


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=ValidationError("Gender validation failed"))
async def test_gender_command_service_validation_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test gender_command handles ValidationError from update_user service."""
    # Arrange
    test_gender = "male"
    error_message = "Gender validation failed"
    mock_context.args = [test_gender]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/gender {test_gender}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.gender_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(
            f"Validation error: {error_message}"
        )


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=NotFoundError("Gender user not found"))
async def test_gender_command_service_not_found_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test gender_command handles NotFoundError from update_user service."""
    # Arrange
    test_gender = "non-binary"
    error_message = "Could not find your profile. Please try /start again."
    mock_context.args = [test_gender]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/gender {test_gender}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.gender_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)


@pytest.mark.asyncio
@RATE_LIMITER_PATCH
@patch("src.bot.handlers.profile.update_user", side_effect=Exception("Generic gender error"))
async def test_gender_command_service_generic_error(
    mock_handler_update_user: AsyncMock,  # Correctly get the mock object, add type hint
    mock_update: AsyncMock,
    mock_context: MagicMock,
    mock_user: User,
    mock_env: MockEnv,
) -> None:
    """Test gender_command handles generic Exception from update_user service."""
    # Arrange
    test_gender = "other"
    error_message = "Sorry, something went wrong while updating your gender. Please try again later."
    mock_context.args = [test_gender]
    mock_context.bot_data = {"env": mock_env}
    mock_context.user_data = {"user": mock_user}  # Add user_data
    mock_update.effective_user.id = mock_user.telegram_id
    mock_update.message.text = f"/gender {test_gender}"  # Add message.text

    with patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock) as mock_decorator_get_user, \
         patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock) as mock_decorator_update_last_active:

        mock_decorator_get_user.return_value = mock_user

        # Act
        await profile_handlers.gender_command(mock_update, mock_context)

        # Assert
        mock_decorator_get_user.assert_called_once()
        mock_decorator_update_last_active.assert_called_once()
        mock_handler_update_user.assert_awaited_once()  # Check service call
        mock_update.effective_message.reply_text.assert_awaited_once_with(error_message)

# --- Location Command Tests --- #
