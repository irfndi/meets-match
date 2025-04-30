"""Test the application module using our mock."""

from unittest.mock import AsyncMock

import pytest

# Import our mock application
from tests.mocks.application import BotApplication
from tests.mocks.telegram import MockContext, MockUpdate


@pytest.mark.asyncio
async def test_application_initialization():
    """Test application initialization."""
    # Create the application
    app = BotApplication()

    # Verify it was created
    assert app is not None
    assert app.application is not None
    assert app.bot is not None
    assert app.initialized is False


@pytest.mark.asyncio
async def test_application_setup():
    """Test application setup."""
    # Create the application
    app = BotApplication()

    # Spy on _register_handlers method
    original_register = app._register_handlers
    register_spy = AsyncMock(wraps=original_register)
    app._register_handlers = register_spy

    # Setup the application
    await app.setup()

    # Verify it was setup
    assert app.initialized is True
    assert register_spy.called


@pytest.mark.asyncio
async def test_application_run():
    """Test application run."""
    # Create the application
    app = BotApplication()

    # Spy on setup method
    original_setup = app.setup
    setup_spy = AsyncMock(wraps=original_setup)
    app.setup = setup_spy

    # Run the application
    await app.run()

    # Verify it was run
    assert setup_spy.called
    assert app.application.start_polling.called
    assert app.application.run_polling.called


@pytest.mark.asyncio
async def test_register_handlers():
    """Test registering handlers."""
    # Create the application
    app = BotApplication()

    # Register handlers
    await app._register_handlers()

    # Verify handlers were registered
    assert app.application.add_handler.call_count == 5
    assert app.application.add_error_handler.called


@pytest.mark.asyncio
async def test_error_handler():
    """Test error handler."""
    # Create the application
    app = BotApplication()

    # Create mock update and context
    update = MockUpdate()
    context = MockContext()
    error_instance = Exception("Test error")

    # Call the original error handler directly
    try:
        await app.error_handler(update, context, error_instance)
    except Exception as e:
        pytest.fail(f"app.error_handler raised an exception unexpectedly: {e}")

    # Optional: Add assertion if the handler modifies state or logs
    # For now, just ensure it runs without TypeError
