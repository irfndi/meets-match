from unittest.mock import MagicMock, patch

import pytest

# Import application after mocks are set up in conftest.py
from src.bot.application import BotApplication
from src.utils.errors import DatabaseError, MeetMatchError


@pytest.mark.asyncio
async def test_application_initialization(mock_application):
    """Test async application initialization"""
    # Mock the Application.builder
    with patch("telegram.ext.Application.builder") as mock_builder:
        # Setup the mock builder
        mock_builder.return_value.token.return_value.build.return_value = mock_application

        # Create the application
        app = BotApplication()

        # Mock the setup method to avoid actual Telegram API calls
        with patch.object(app, "_register_handlers"):
            await app.setup()

        assert app.application is not None


@pytest.mark.asyncio
async def test_application_run(mock_application):
    """Test main application run flow"""
    # Create the application
    app = BotApplication()

    # Mock necessary methods to avoid actual API calls
    with patch.object(app, "setup"), patch.object(app, "application") as mock_app:
        # Setup mocks for application methods
        mock_app.run_polling = MagicMock(side_effect=Exception("Test exit"))

        # Run should call setup if application is None
        try:
            app.run()
        except Exception as e:
            assert str(e) == "Test exit"

        # Verify the methods were called
        mock_app.run_polling.assert_called_once()


@pytest.mark.asyncio
async def test_error_handler(mock_application, mock_update, mock_context):
    """Test the error handler."""
    # Create the application
    app = BotApplication()

    # Set the application
    app.application = mock_application

    # Create a test error
    mock_context.error = Exception("Test error")

    # Call the error handler
    await app._error_handler(mock_update, mock_context)

    # Verify error was handled (no exception raised)
    assert True


@pytest.mark.asyncio
async def test_register_handlers(mock_application):
    """Test that handlers are registered correctly."""
    # Create the application
    app = BotApplication()

    # Set the application
    app.application = mock_application

    # Register handlers
    app._register_handlers()

    # Verify handlers were added
    assert mock_application.add_handler.call_count > 0


@pytest.mark.asyncio
async def test_error_handler_captures_database_error_in_otel(mock_application, mock_update, mock_context):
    """Test that database errors are captured by OpenTelemetry."""
    app = BotApplication()
    app.application = mock_application

    # Create a database error
    db_error = DatabaseError("Database connection failed", details={"table": "users"})
    mock_context.error = db_error

    # Mock tracer
    mock_span = MagicMock()
    with patch("src.bot.application.tracer") as mock_tracer:
        mock_tracer.start_as_current_span.return_value.__enter__.return_value = mock_span

        await app._error_handler(mock_update, mock_context)

        # Verify OpenTelemetry captured the exception
        mock_span.record_exception.assert_called_once_with(db_error)
        mock_span.set_status.assert_called_once()


@pytest.mark.asyncio
async def test_error_handler_captures_meetmatch_error_in_otel(mock_application, mock_update, mock_context):
    """Test that MeetMatch errors are captured by OpenTelemetry."""
    app = BotApplication()
    app.application = mock_application

    # Create a custom MeetMatchError
    custom_error = MeetMatchError("Custom error occurred")
    mock_context.error = custom_error

    # Mock tracer
    mock_span = MagicMock()
    with patch("src.bot.application.tracer") as mock_tracer:
        mock_tracer.start_as_current_span.return_value.__enter__.return_value = mock_span

        await app._error_handler(mock_update, mock_context)

        # Verify OpenTelemetry captured the exception
        mock_span.record_exception.assert_called_once_with(custom_error)


@pytest.mark.asyncio
async def test_error_handler_captures_unexpected_error_in_otel(mock_application, mock_update, mock_context):
    """Test that unexpected errors are captured by OpenTelemetry."""
    app = BotApplication()
    app.application = mock_application

    # Create an unexpected error
    unexpected_error = ValueError("Unexpected value error")
    mock_context.error = unexpected_error

    # Mock tracer
    mock_span = MagicMock()
    with patch("src.bot.application.tracer") as mock_tracer:
        mock_tracer.start_as_current_span.return_value.__enter__.return_value = mock_span

        await app._error_handler(mock_update, mock_context)

        # Verify OpenTelemetry captured the exception
        mock_span.record_exception.assert_called_once_with(unexpected_error)


@pytest.mark.asyncio
async def test_error_handler_does_not_capture_conflict_error_in_otel(mock_application, mock_update, mock_context):
    """Test that polling conflict errors are not captured by OpenTelemetry."""
    from telegram.error import Conflict

    app = BotApplication()
    app.application = mock_application

    # Create a conflict error
    conflict_error = Conflict("Conflict: another bot instance is running")
    mock_context.error = conflict_error

    # Mock tracer
    mock_span = MagicMock()
    with patch("src.bot.application.tracer") as mock_tracer:
        mock_tracer.start_as_current_span.return_value.__enter__.return_value = mock_span

        await app._error_handler(mock_update, mock_context)

        # Verify OpenTelemetry did NOT capture the conflict exception (because it returns early)
        mock_tracer.start_as_current_span.assert_not_called()


@pytest.mark.asyncio
async def test_error_handler_sets_otel_user_attributes(mock_application, mock_context):
    """Test that OpenTelemetry user attributes are set when user info is available."""
    from unittest.mock import MagicMock

    from telegram import Update, User

    app = BotApplication()
    app.application = mock_application

    # Create a proper Update mock with spec
    mock_update = MagicMock(spec=Update)
    mock_user = MagicMock(spec=User)
    mock_user.id = 123456
    mock_user.username = "test_user"
    mock_update.effective_user = mock_user
    mock_update.effective_chat = None

    # Create an error
    mock_context.error = ValueError("Some error")

    # Mock tracer
    mock_span = MagicMock()
    with patch("src.bot.application.tracer") as mock_tracer:
        mock_tracer.start_as_current_span.return_value.__enter__.return_value = mock_span

        await app._error_handler(mock_update, mock_context)

        # Verify OpenTelemetry attributes were set
        mock_span.set_attribute.assert_any_call("user.id", "123456")
        mock_span.set_attribute.assert_any_call("user.username", "test_user")
