from unittest.mock import MagicMock, patch

import pytest

# Import application after mocks are set up in conftest.py
from src.bot.application import BotApplication


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
