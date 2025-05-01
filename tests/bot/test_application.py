from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Chat, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
)

from src.bot.application import BotApplication, run_bot, start_bot
from src.config import Settings
from src.utils.errors import MeetMatchError

# Mocks for handlers (to check if add_handler is called)
_MOCK_HANDLERS = {
    "start_command": CommandHandler("start", MagicMock()),
    "profile_command": CommandHandler("profile", MagicMock()),
    # Add mocks for ALL handlers registered in _register_handlers if needed for full verification
    # For now, just check a few types
    "match_callback": CallbackQueryHandler(MagicMock(), pattern=r"^(like_|dislike_|next_match)"),
    "location_handler": MessageHandler(MagicMock(), MagicMock()),
}


@pytest.fixture
def mock_settings():
    """Fixture to provide mocked Settings."""
    settings = Settings(
        TELEGRAM_TOKEN="fake-token",
        ADMIN_IDS="123,456",
        ENVIRONMENT="test",
        LOG_LEVEL="DEBUG",
        API_HOST="127.0.0.1",
        API_PORT=8888,
        MATCH_THRESHOLD=0.7,
        LOCATION_WEIGHT=0.3,
        INTERESTS_WEIGHT=0.5,
        PREFERENCES_WEIGHT=0.2,
        # Add other required settings fields with default/fake values
        DATABASE_URL="sqlite+aiosqlite:///./test.db",  # Example, adjust if needed
        TIMEZONE="UTC",
        REDIS_URL="redis://localhost",
        SENTRY_DSN=None,
        ENABLE_SENTRY=False,
        CLOUDFLARE_ACCOUNT_ID="fake-acc-id",
        CLOUDFLARE_API_TOKEN="fake-api-token",
        D1_DATABASE_ID="fake-d1-id",
        KV_NAMESPACE_ID="fake-kv-id",
        R2_BUCKET_NAME="fake-r2-bucket",
    )
    return settings


@pytest.mark.asyncio
@patch("src.bot.application.get_settings")
async def test_bot_application_init(mock_get_settings, mock_settings):
    """Test BotApplication initialization."""
    mock_get_settings.return_value = mock_settings

    bot_app = BotApplication()

    assert bot_app.application is None
    assert bot_app.admin_ids == {"123", "456"}
    mock_get_settings.assert_called()


@pytest.mark.asyncio
@patch("src.bot.application.Application")
@patch("src.bot.application.Defaults")
@patch("src.bot.application.logger.info")
async def test_bot_application_setup(mock_log_info, mock_defaults, mock_application_cls, mock_settings):
    """Test the setup method initializes and configures the Application correctly."""
    # Arrange
    # Mock the builder chain
    mock_builder = MagicMock()
    mock_application_instance = MagicMock()
    mock_application_cls.builder.return_value = mock_builder
    mock_builder.token.return_value = mock_builder
    mock_builder.defaults.return_value = mock_builder
    mock_builder.build.return_value = mock_application_instance

    # Mock Defaults instance and configure the patch to return it
    mock_defaults_instance = MagicMock()
    mock_defaults.return_value = mock_defaults_instance

    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()

        # Act
        await bot_app.setup()

    # Assert
    mock_application_cls.builder.assert_called_once()
    mock_builder.token.assert_called_once_with(mock_settings.TELEGRAM_TOKEN)
    # Check that Defaults was initialized correctly and used
    mock_defaults.assert_called_once_with(parse_mode="HTML", allow_sending_without_reply=True)
    mock_builder.defaults.assert_called_once_with(mock_defaults_instance)
    mock_builder.build.assert_called_once()
    assert bot_app.application == mock_application_instance
    # _register_handlers is called internally by setup, check its effects instead:
    mock_application_instance.add_error_handler.assert_called_once_with(bot_app._error_handler)
    # Check the final log message
    mock_log_info.assert_any_call("Bot application setup complete")  # Might be other info logs


@pytest.mark.asyncio
@patch("src.bot.application.Application.builder")
@patch("src.bot.application.get_settings")
async def test_bot_application_register_handlers(mock_get_settings, mock_app_builder, mock_settings):
    """Test that _register_handlers adds expected handlers."""
    mock_get_settings.return_value = mock_settings

    # Mock the application instance that _register_handlers will use
    mock_application_instance = MagicMock(spec=Application)
    mock_add_handler = MagicMock()
    mock_add_error_handler = MagicMock()
    mock_application_instance.add_handler = mock_add_handler
    mock_application_instance.add_error_handler = mock_add_error_handler

    # Setup mocks for builder chain as in previous test
    mock_builder_instance = MagicMock()
    mock_app_builder.return_value = mock_builder_instance
    mock_builder_instance.token.return_value = mock_builder_instance
    mock_builder_instance.build.return_value = mock_application_instance

    bot_app = BotApplication()
    # Manually set the application instance for the test
    bot_app.application = mock_application_instance
    bot_app._register_handlers()  # Call the method directly

    # Assert that add_handler was called multiple times
    assert mock_add_handler.call_count > 10  # Check a reasonable number of handlers

    # Example: Check if a specific handler was added (more specific tests can be added)
    # Find the call for the 'start' command
    start_handler_call = None
    for handler_call in mock_add_handler.call_args_list:
        handler = handler_call[0][0]
        if isinstance(handler, CommandHandler) and "start" in handler.commands:
            start_handler_call = handler_call
            break
    assert start_handler_call is not None

    # Assert that add_error_handler was called once
    mock_add_error_handler.assert_called_once_with(bot_app._error_handler)


# --- Run Method Tests ---


@pytest.mark.asyncio
@patch("src.bot.application.logger.info")
async def test_bot_application_run_success(mock_log_info, mock_settings):
    """Test the run method calls run_polling and logs stop message."""
    # Arrange
    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()
        # Mock the application object that setup would create
        mock_application = MagicMock(spec=Application)
        mock_updater = MagicMock()
        mock_application.initialize = AsyncMock()
        mock_application.start = AsyncMock()
        mock_updater.start_polling = AsyncMock()
        mock_updater.idle = AsyncMock()
        mock_application.updater = mock_updater
        mock_application.stop = AsyncMock()
        mock_application.shutdown = AsyncMock()
        bot_app.application = mock_application

        # Act
        await bot_app.run()

    # Assert
    # Check that all awaited methods were called
    mock_application.initialize.assert_awaited_once()
    mock_application.start.assert_awaited_once()
    mock_updater.start_polling.assert_awaited_once()
    mock_updater.idle.assert_awaited_once()
    # Check final calls in finally block
    mock_application.stop.assert_awaited_once()
    mock_application.shutdown.assert_awaited_once()
    mock_log_info.assert_called_with("Bot stopped")


# --- Error Handler Tests ---


@pytest.mark.asyncio
@patch("src.bot.application.logger.error")
@patch("src.bot.application.logger.warning")
async def test_bot_application_error_handler_meetmatch_error(mock_error, mock_warning, mock_settings):
    """Test error handler logs and sends specific message for MeetMatchError."""
    # Mocks for Update and Context
    mock_update = MagicMock(spec=Update)
    mock_update.effective_chat = MagicMock(spec=Chat, id=12345)
    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot = AsyncMock()
    mock_context.error = MeetMatchError("Custom error occurred")

    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()
        await bot_app._error_handler(mock_update, mock_context)

    # Assertions
    # mock_error holds the mock for logger.warning due to decorator order
    mock_error.assert_called_once_with(
        "Bot error",
        error_type="MeetMatchError",
        error_message="Custom error occurred",
        error_details={},
        update_id=mock_update.update_id,
    )
    # mock_warning holds the mock for logger.error due to decorator order
    mock_warning.assert_not_called()  # Ensure error wasn't called

    mock_context.bot.send_message.assert_awaited_once_with(chat_id=12345, text="Error: Custom error occurred")


@pytest.mark.asyncio
@patch("src.bot.application.logger.warning")
@patch("src.bot.application.logger.error")
async def test_bot_application_error_handler_unexpected_error(mock_error, mock_warning, mock_settings):
    """Test error handler logs details and sends generic message for unexpected errors."""
    # Mocks for Update and Context
    mock_update = MagicMock(spec=Update)
    mock_update.effective_chat = MagicMock(spec=Chat, id=12345)
    mock_update.to_json.return_value = '{"update_id": 1}'  # Simple JSON representation
    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot = AsyncMock()
    mock_context.error = ValueError("Something unexpected went wrong")  # Generic Exception

    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()
        await bot_app._error_handler(mock_update, mock_context)

    # Assertions
    mock_error.assert_called_once_with(
        "Unexpected bot error",
        error=str(mock_context.error),
        update_id=mock_update.update_id,
        exc_info=mock_context.error,
    )
    mock_warning.assert_not_called()

    mock_context.bot.send_message.assert_awaited_once_with(
        chat_id=12345, text="An unexpected error occurred. Please try again later."
    )


@pytest.mark.asyncio
@patch("src.bot.application.logger.warning")
@patch("src.bot.application.logger.error")
async def test_error_handler_meetmatch_error_with_chat(mock_log_error, mock_log_warning, mock_settings):
    """Test _error_handler with a MeetMatchError and an effective chat."""
    # Arrange
    mock_update = MagicMock(spec=Update)
    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock()
    mock_context.bot = mock_bot

    test_chat_id = 12345
    test_update_id = 67890
    mock_update.effective_chat = MagicMock(spec=Chat, id=test_chat_id)
    mock_update.update_id = test_update_id

    custom_error = MeetMatchError("Test custom error", details={"code": 101})
    mock_context.error = custom_error

    # Act & Assert within patch context
    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()
        await bot_app._error_handler(mock_update, mock_context)

    # Assert
    mock_log_warning.assert_called_once_with(
        "Bot error",
        error_type="MeetMatchError",
        error_message="Test custom error",
        error_details={"code": 101},
        update_id=test_update_id,
    )
    mock_context.bot.send_message.assert_awaited_once_with(chat_id=test_chat_id, text=f"Error: {custom_error.message}")
    mock_log_error.assert_not_called()


@pytest.mark.asyncio
@patch("src.bot.application.logger.warning")
@patch("src.bot.application.logger.error")
async def test_error_handler_meetmatch_error_no_chat(mock_log_error, mock_log_warning, mock_settings):
    """Test _error_handler with a MeetMatchError and no effective chat."""
    # Arrange
    mock_update = MagicMock(spec=Update)
    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot = MagicMock()  # Bot needed but send_message won't be called

    mock_update.effective_chat = None
    mock_update.update_id = 98765

    custom_error = MeetMatchError("Another custom error")
    mock_context.error = custom_error

    # Act & Assert within patch context
    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()
        await bot_app._error_handler(mock_update, mock_context)

    # Assert
    mock_log_warning.assert_called_once_with(
        "Bot error",
        error_type="MeetMatchError",
        error_message="Another custom error",
        error_details={},
        update_id=98765,
    )
    mock_context.bot.send_message.assert_not_called()
    mock_log_error.assert_not_called()


@pytest.mark.asyncio
@patch("src.bot.application.logger.warning")
@patch("src.bot.application.logger.error")
async def test_error_handler_unexpected_error_with_chat(mock_log_error, mock_log_warning, mock_settings):
    """Test _error_handler with an unexpected error and an effective chat."""
    # Arrange
    mock_update = MagicMock(spec=Update)
    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock()
    mock_context.bot = mock_bot

    test_chat_id = 54321
    test_update_id = 11223
    mock_update.effective_chat = MagicMock(spec=Chat, id=test_chat_id)
    mock_update.update_id = test_update_id

    unexpected_error = ValueError("Something went wrong")
    mock_context.error = unexpected_error

    # Act & Assert within patch context
    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()
        await bot_app._error_handler(mock_update, mock_context)

    # Assert
    mock_log_error.assert_called_once_with(
        "Unexpected bot error",
        error="Something went wrong",
        update_id=test_update_id,
        exc_info=unexpected_error,
    )
    mock_context.bot.send_message.assert_awaited_once_with(
        chat_id=test_chat_id, text="An unexpected error occurred. Please try again later."
    )
    mock_log_warning.assert_not_called()


@pytest.mark.asyncio
@patch("src.bot.application.logger.warning")
@patch("src.bot.application.logger.error")
async def test_error_handler_unexpected_error_no_chat(mock_log_error, mock_log_warning, mock_settings):
    """Test _error_handler with an unexpected error and no effective chat."""
    # Arrange
    mock_update = MagicMock(spec=Update)
    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot = MagicMock()

    mock_update.effective_chat = None
    mock_update.update_id = 33445

    unexpected_error = TypeError("Bad type")
    mock_context.error = unexpected_error

    # Act & Assert within patch context
    with patch("src.bot.application.get_settings", return_value=mock_settings):
        bot_app = BotApplication()
        await bot_app._error_handler(mock_update, mock_context)

    # Assert
    mock_log_error.assert_called_once_with(
        "Unexpected bot error", error="Bad type", update_id=33445, exc_info=unexpected_error
    )
    mock_context.bot.send_message.assert_not_called()
    mock_log_warning.assert_not_called()


# --- Test Helper/Entrypoint Functions ---


@patch("src.bot.application.asyncio.run")
@patch("src.bot.application.configure_logging")
@patch("src.bot.application.run_bot")  # Patch the function called by asyncio.run
@patch("src.bot.application.get_settings")
def test_start_bot(mock_get_settings, mock_run_bot, mock_configure_logging, mock_asyncio_run, mock_settings):
    """Test the start_bot entrypoint function."""
    # Arrange
    mock_get_settings.return_value = mock_settings
    # mock_run_bot is already a mock due to the patcher

    # Act
    start_bot()

    # Assert
    mock_get_settings.assert_called()
    mock_configure_logging.assert_called_once_with(
        mock_settings.LOG_LEVEL, mock_settings.ENVIRONMENT, mock_settings.SENTRY_DSN, mock_settings.ENABLE_SENTRY
    )
    # Assert run_bot was called (implicitly by start_bot)
    mock_run_bot.assert_called_once()
    # Assert asyncio.run was called with the coroutine object returned by the actual call to run_bot
    mock_asyncio_run.assert_called_once()


@pytest.mark.asyncio
@patch("src.bot.application.BotApplication")
async def test_run_bot(MockBotApplication):
    """Test the run_bot async helper function."""
    # Arrange
    mock_bot_instance = MagicMock()
    mock_bot_instance.run = AsyncMock()
    MockBotApplication.return_value = mock_bot_instance

    # Act
    await run_bot()

    # Assert
    MockBotApplication.assert_called_once()
    mock_bot_instance.run.assert_awaited_once()
