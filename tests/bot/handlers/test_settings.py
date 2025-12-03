import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import CallbackQuery, Message, Update, User
from telegram.ext import ContextTypes


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.settings",
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
def mock_middleware_fix():
    """Mock the middleware module to provide a pass-through authenticated decorator."""
    mock_mod = MagicMock()

    def pass_through(func):
        return func

    mock_mod.authenticated = pass_through
    mock_mod.user_command_limiter = MagicMock(return_value=AsyncMock())

    with patch.dict(sys.modules, {"src.bot.middleware": mock_mod}):
        yield mock_mod


@pytest.fixture
def settings_handler_module(mock_middleware_fix):
    return importlib.import_module("src.bot.handlers.settings")


@pytest.fixture
def mock_dependencies(settings_handler_module):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_update_user = MagicMock()
    mock_update_user_preferences = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())  # Returns an async function

    with (
        patch.object(settings_handler_module, "get_user", mock_get_user),
        patch.object(settings_handler_module, "update_user", mock_update_user),
        patch.object(settings_handler_module, "update_user_preferences", mock_update_user_preferences),
        patch.object(settings_handler_module, "user_command_limiter", mock_limiter),
    ):
        yield {
            "get_user": mock_get_user,
            "update_user": mock_update_user,
            "update_user_preferences": mock_update_user_preferences,
            "limiter": mock_limiter,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_user.username = "testuser"
    update.effective_user.language_code = "en"

    update.message = AsyncMock(spec=Message)
    update.message.reply_text = AsyncMock()

    update.callback_query = AsyncMock(spec=CallbackQuery)
    update.callback_query.data = None
    update.callback_query.answer = AsyncMock()
    update.callback_query.edit_message_text = AsyncMock()
    update.callback_query.message = AsyncMock(spec=Message)

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    return update, context


@pytest.mark.asyncio
async def test_settings_command(settings_handler_module, mock_dependencies, mock_update_context):
    """Test settings command."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock user
    mock_user = MagicMock()
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"
    mock_deps["get_user"].return_value = mock_user

    await settings_handler_module.settings_command(update, context)

    # Verify limiter called
    mock_deps["limiter"].assert_called()

    # Verify message sent
    update.message.reply_text.assert_called()
    args, kwargs = update.message.reply_text.call_args
    assert "Settings" in args[0]
    assert "Region: USA" in args[0]
    assert "Language: en" in args[0]
    assert "reply_markup" in kwargs


@pytest.mark.asyncio
async def test_settings_callback_region(settings_handler_module, mock_dependencies, mock_update_context):
    """Test settings callback for region selection."""
    update, context = mock_update_context

    update.callback_query.data = "settings_region"

    await settings_handler_module.settings_callback(update, context)

    update.callback_query.edit_message_text.assert_called()
    args, kwargs = update.callback_query.edit_message_text.call_args
    assert "Select your region" in args[0]
    assert "reply_markup" in kwargs


@pytest.mark.asyncio
async def test_settings_callback_update_region(settings_handler_module, mock_dependencies, mock_update_context):
    """Test settings callback for updating region."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Get real Preferences class
    user_model = importlib.import_module("src.models.user")
    Preferences = user_model.Preferences

    update.callback_query.data = "region_Indonesia"

    # Mock user with real Preferences
    mock_user = MagicMock()
    mock_user.preferences = Preferences()
    mock_user.location = None
    mock_deps["get_user"].return_value = mock_user

    await settings_handler_module.settings_callback(update, context)

    # Verify update_user called
    mock_deps["update_user"].assert_called()
    args, _ = mock_deps["update_user"].call_args
    assert args[0] == "12345"
    assert args[1]["preferences"]["preferred_country"] == "Indonesia"

    # Verify confirmation message
    update.callback_query.edit_message_text.assert_called()
    args, _ = update.callback_query.edit_message_text.call_args
    assert "Region updated to: Indonesia" in args[0]


@pytest.mark.asyncio
async def test_settings_callback_update_language(settings_handler_module, mock_dependencies, mock_update_context):
    """Test settings callback for updating language."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Get real Preferences class
    user_model = importlib.import_module("src.models.user")
    Preferences = user_model.Preferences

    update.callback_query.data = "language_id"

    # Mock user with real Preferences
    mock_user = MagicMock()
    mock_user.preferences = Preferences()
    mock_deps["get_user"].return_value = mock_user

    await settings_handler_module.settings_callback(update, context)

    # Verify update_user_preferences called
    mock_deps["update_user_preferences"].assert_called()
    args, _ = mock_deps["update_user_preferences"].call_args
    assert args[0] == "12345"
    assert args[1].preferred_language == "id"

    # Verify confirmation message
    update.callback_query.edit_message_text.assert_called()
    args, _ = update.callback_query.edit_message_text.call_args
    assert "Language updated to: id" in args[0]
