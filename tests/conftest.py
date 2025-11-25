"""pytest configuration and fixtures."""

# TODO: Cloudflare Migration Testing
# This file likely contains fixtures and mocking setup for the previous infrastructure
# (PostgreSQL/Supabase, Redis, S3). These need to be comprehensively updated:
# 1. Replace database mocks/fixtures with mocks for Cloudflare D1 bindings.
# 2. Replace Redis mocks/fixtures with mocks for Cloudflare KV bindings.
# 3. Replace S3 mocks/fixtures with mocks for Cloudflare R2 bindings.
# 4. Ensure mocks accurately simulate the behavior and APIs of Cloudflare services.
# 5. Consider using tools like 'miniflare' or dedicated Cloudflare mocking libraries if available.

import importlib
import os
import sys

import pytest

# Add pytest configuration for asyncio
pytest_plugins = ["pytest_asyncio"]


# Configure asyncio for pytest
@pytest.fixture(scope="session")
def event_loop_policy():
    """Configure event loop policy for pytest-asyncio."""
    import asyncio

    return asyncio.get_event_loop_policy()


# Set environment variables for testing
@pytest.fixture(autouse=True, scope="session")
def set_test_env():
    """Set environment variables for testing."""
    env_vars = {
        "TELEGRAM_TOKEN": "test_token",
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_KEY": "test_key",
        "REDIS_URL": "redis://localhost:6379/0",
        "DEBUG": "True",
        "ENABLE_SENTRY": "False",
        "ADMIN_IDS": "123456,789012",
        "TELEGRAM_BOT_TOKEN": "test_bot_token",
    }

    # Save original environment
    original_env = {}
    for key in env_vars:
        if key in os.environ:
            original_env[key] = os.environ[key]

    # Set test environment variables
    for key, value in env_vars.items():
        os.environ[key] = value

    yield

    # Restore original environment
    for key in env_vars:
        if key in original_env:
            os.environ[key] = original_env[key]
        else:
            if key in os.environ:
                del os.environ[key]


# Mock modules for testing
@pytest.fixture(autouse=True, scope="session")
def mock_modules():
    """Mock all required modules for testing."""
    # Define module mappings (real module -> mock module)
    module_mappings = {
        "src.config": "tests.mocks.config",
        "src.utils.cache": "tests.mocks.utils",
        "src.utils.errors": "tests.mocks.utils",
        "src.utils.logger": "tests.mocks.utils",
        "src.models.user": "tests.mocks.models",
        "src.models.conversation": "tests.mocks.models",
        "src.services.user_service": "tests.mocks.services",
        "src.services.conversation_service": "tests.mocks.services",
        "src.services.match_service": "tests.mocks.services",
        "src.services.profile_service": "tests.mocks.services",
    }

    # Save original modules
    original_modules = {}
    for real_module in module_mappings:
        if real_module in sys.modules:
            original_modules[real_module] = sys.modules[real_module]

    # Apply mock modules
    mocked_modules = {}
    for real_module, mock_module in module_mappings.items():
        # Import the mock module
        try:
            mocked_modules[real_module] = importlib.import_module(mock_module)
            # Add it to sys.modules under the real name
            sys.modules[real_module] = mocked_modules[real_module]
        except ImportError as e:
            print(f"Error importing mock module {mock_module}: {e}")

    yield

    # Restore original modules
    for real_module in module_mappings:
        if real_module in original_modules:
            sys.modules[real_module] = original_modules[real_module]
        else:
            if real_module in sys.modules:
                del sys.modules[real_module]


# Mock Telegram application
@pytest.fixture
def mock_application():
    """Create a mock Telegram application."""
    from tests.mocks.telegram import MockApplication

    return MockApplication()


# Mock Telegram bot
@pytest.fixture
def mock_bot():
    """Create a mock Telegram bot."""
    from tests.mocks.telegram import MockBot

    return MockBot()


# Mock Telegram update
@pytest.fixture
def mock_update():
    """Create a mock Telegram update."""
    from tests.mocks.telegram import create_mock_update

    return create_mock_update()


# Mock Telegram context
@pytest.fixture
def mock_context(mock_bot):
    """Create a mock Telegram context."""
    from tests.mocks.telegram import create_mock_context

    return create_mock_context(bot=mock_bot)
