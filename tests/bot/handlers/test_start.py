import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.start",
        "src.services.user_service",
        "src.utils.errors",
        "src.models.user",
    ]

    original_modules = {}
    for module_name in modules_to_restore:
        if module_name in sys.modules:
            original_modules[module_name] = sys.modules[module_name]
            del sys.modules[module_name]

    yield

    for module_name, module in original_modules.items():
        sys.modules[module_name] = module


@pytest.fixture
def start_handler_module():
    return importlib.import_module("src.bot.handlers.start")


@pytest.fixture
def mock_dependencies(start_handler_module):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_create_user = MagicMock()
    mock_update_user = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())  # Returns an async function
    mock_main_menu = MagicMock()

    with (
        patch.object(start_handler_module, "get_user", mock_get_user),
        patch.object(start_handler_module, "create_user", mock_create_user),
        patch.object(start_handler_module, "update_user", mock_update_user),
        patch.object(start_handler_module, "user_command_limiter", mock_limiter),
        patch.object(start_handler_module, "main_menu", mock_main_menu),
    ):
        yield {
            "get_user": mock_get_user,
            "create_user": mock_create_user,
            "update_user": mock_update_user,
            "limiter": mock_limiter,
            "main_menu": mock_main_menu,
        }


@pytest.fixture
def mock_settings_module():
    """Mock settings module to avoid import errors."""
    mock_module = MagicMock()
    mock_command = AsyncMock()
    mock_module.settings_command = mock_command

    with patch.dict(sys.modules, {"src.bot.handlers.settings": mock_module}):
        yield mock_command


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_user.username = "testuser"
    update.effective_user.first_name = "Test"
    update.effective_user.last_name = "User"

    update.message = AsyncMock(spec=Message)
    update.message.reply_text = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)

    return update, context


@pytest.mark.asyncio
async def test_start_existing_user(start_handler_module, mock_dependencies, mock_update_context):
    """Test start command for existing user with complete profile."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock existing user
    mock_user = MagicMock()
    mock_user.id = "12345"
    mock_user.username = "testuser"
    mock_user.first_name = "Test"
    # Mock preferences present
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"

    mock_deps["get_user"].return_value = mock_user

    await start_handler_module.start_command(update, context)

    # Verify limiter called
    mock_deps["limiter"].assert_called()

    # Verify welcome message
    update.message.reply_text.assert_called()
    args, kwargs = update.message.reply_text.call_args
    assert "Welcome back" in args[0]
    assert "reply_markup" in kwargs


@pytest.mark.asyncio
async def test_start_new_user(start_handler_module, mock_dependencies, mock_update_context, mock_settings_module):
    """Test start command for new user."""
    from src.utils.errors import NotFoundError

    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_deps["get_user"].side_effect = NotFoundError("User not found")

    await start_handler_module.start_command(update, context)

    # Verify create_user called
    mock_deps["create_user"].assert_called()

    # Verify settings command called
    mock_settings_module.assert_called_with(update, context)

    # Verify welcome message
    update.message.reply_text.assert_called()
    args, _ = update.message.reply_text.call_args
    assert "Welcome to MeetMatch" in args[0]


@pytest.mark.asyncio
async def test_start_existing_user_update_info(start_handler_module, mock_dependencies, mock_update_context):
    """Test start command updates user info if changed."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock existing user with DIFFERENT name
    mock_user = MagicMock()
    mock_user.id = "12345"
    mock_user.username = "olduser"
    mock_user.first_name = "Old"
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"

    mock_deps["get_user"].return_value = mock_user

    await start_handler_module.start_command(update, context)

    # Verify update_user called
    mock_deps["update_user"].assert_called()
    args, _ = mock_deps["update_user"].call_args
    assert args[0] == "12345"
    assert args[1]["first_name"] == "Test"  # From update
    assert args[1]["username"] == "testuser"


@pytest.mark.asyncio
async def test_start_existing_user_missing_settings(
    start_handler_module, mock_dependencies, mock_update_context, mock_settings_module
):
    """Test start command redirects to settings if missing preferences."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.preferences = None  # Missing preferences

    mock_deps["get_user"].return_value = mock_user

    await start_handler_module.start_command(update, context)

    # Verify settings command called
    mock_settings_module.assert_called_with(update, context)

    # Verify message
    update.message.reply_text.assert_called()
    args, _ = update.message.reply_text.call_args
    assert "Please set your region and language" in args[0]
