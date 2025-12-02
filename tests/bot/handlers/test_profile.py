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
        "src.bot.handlers.profile",
        "src.services.user_service",
        "src.models.user",
        "src.utils.errors",
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
def profile_handler_module(mock_middleware_fix):
    return importlib.import_module("src.bot.handlers.profile")


@pytest.fixture
def mock_dependencies(profile_handler_module):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_update_user = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())

    # Mock UI helpers
    mock_main_menu = MagicMock()
    mock_profile_menu = MagicMock()
    mock_cancel_kb = MagicMock()
    mock_skip_cancel_kb = MagicMock()
    mock_gender_kb = MagicMock()

    with (
        patch.object(profile_handler_module, "get_user", mock_get_user),
        patch.object(profile_handler_module, "update_user", mock_update_user),
        patch.object(profile_handler_module, "user_command_limiter", mock_limiter),
        patch.object(profile_handler_module, "main_menu", mock_main_menu),
        patch.object(profile_handler_module, "profile_main_menu", mock_profile_menu),
        patch.object(profile_handler_module, "cancel_keyboard", mock_cancel_kb),
        patch.object(profile_handler_module, "skip_cancel_keyboard", mock_skip_cancel_kb),
        patch.object(profile_handler_module, "gender_keyboard", mock_gender_kb),
    ):
        yield {
            "get_user": mock_get_user,
            "update_user": mock_update_user,
            "limiter": mock_limiter,
            "main_menu": mock_main_menu,
            "profile_main_menu": mock_profile_menu,
            "cancel_keyboard": mock_cancel_kb,
            "skip_cancel_keyboard": mock_skip_cancel_kb,
            "gender_keyboard": mock_gender_kb,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.message = AsyncMock(spec=Message)
    update.message.text = "/profile"
    update.message.reply_text = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    return update, context


@pytest.mark.asyncio
async def test_profile_command(profile_handler_module, mock_dependencies, mock_update_context):
    """Test /profile command."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    await profile_handler_module.profile_command(update, context)

    # Verify limiter called
    mock_deps["limiter"].assert_called()

    # Verify menu sent
    update.message.reply_text.assert_called()
    args, kwargs = update.message.reply_text.call_args
    assert "View profiles" in args[0]
    assert "reply_markup" in kwargs

    # Verify state set
    assert context.user_data.get("profile_menu") is True


@pytest.mark.asyncio
async def test_name_command_prompt(profile_handler_module, mock_dependencies, mock_update_context):
    """Test /name command prompting for input."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    update.message.text = "/name"

    # Mock user
    mock_user = MagicMock()
    mock_user.first_name = None
    mock_deps["get_user"].return_value = mock_user

    await profile_handler_module.name_command(update, context)

    # Verify prompt sent
    update.message.reply_text.assert_called()
    args, _ = update.message.reply_text.call_args
    assert "What's your name?" in args[0]

    # Verify state set
    assert context.user_data.get("awaiting_name") is True


@pytest.mark.asyncio
async def test_name_command_update(profile_handler_module, mock_dependencies, mock_update_context):
    """Test /name command updating name directly."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    update.message.text = "/name John"

    await profile_handler_module.name_command(update, context)

    # Verify update_user called
    mock_deps["update_user"].assert_called()
    args, _ = mock_deps["update_user"].call_args
    assert args[0] == "12345"
    assert args[1]["first_name"] == "John"

    # Verify confirmation
    update.message.reply_text.assert_called()
    # Check if any call contains "John" (since it might be followed by "Profile ready" message)
    calls = update.message.reply_text.call_args_list
    assert any("John" in args[0] for args, kwargs in calls)


@pytest.mark.asyncio
async def test_age_command_prompt(profile_handler_module, mock_dependencies, mock_update_context):
    """Test /age command prompting for input."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    update.message.text = "/age"

    # Mock user
    mock_user = MagicMock()
    mock_user.age = None
    mock_deps["get_user"].return_value = mock_user

    await profile_handler_module.age_command(update, context)

    # Verify prompt sent
    update.message.reply_text.assert_called()
    args, _ = update.message.reply_text.call_args
    assert "How old are you?" in args[0]

    # Verify state set
    assert context.user_data.get("awaiting_age") is True


@pytest.mark.asyncio
async def test_check_and_update_profile_complete(profile_handler_module, mock_dependencies):
    """Test check_and_update_profile_complete."""
    mock_deps = mock_dependencies

    # Test incomplete profile
    mock_user = MagicMock()
    mock_user.first_name = None  # Missing name
    mock_user.age = 25
    mock_user.is_profile_complete = False
    mock_deps["get_user"].return_value = mock_user

    result = profile_handler_module.check_and_update_profile_complete("12345")
    assert result is False

    # Test complete profile
    mock_user.first_name = "John"
    mock_user.age = 25
    mock_user.photos = ["photo.jpg"]
    mock_user.is_profile_complete = False

    result = profile_handler_module.check_and_update_profile_complete("12345")
    assert result is True

    # Verify update_user called to set is_profile_complete=True
    mock_deps["update_user"].assert_called_with("12345", {"is_profile_complete": True})
