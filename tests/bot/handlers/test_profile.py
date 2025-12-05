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
    update.effective_message = update.message

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
async def test_save_age_sets_default_range(profile_handler_module, mock_dependencies, mock_update_context):
    """Age save should set default min/max when none are configured."""
    update, context = mock_update_context
    update.message.text = "30"

    prefs = profile_handler_module.Preferences()
    existing_user = MagicMock()
    existing_user.preferences = prefs
    updated_user = MagicMock()
    updated_user.preferences = prefs

    mock_dependencies["get_user"].side_effect = [existing_user, updated_user, updated_user, updated_user]

    with patch.object(profile_handler_module, "update_user_preferences") as mock_update_prefs:
        success = await profile_handler_module._save_age(update, context, "30")

    assert success is True
    mock_dependencies["update_user"].assert_called()
    mock_update_prefs.assert_called_once()
    called_prefs = mock_update_prefs.call_args[0][1]
    assert called_prefs.min_age == 26
    assert called_prefs.max_age == 34


@pytest.mark.asyncio
async def test_save_age_respects_existing_range(profile_handler_module, mock_dependencies, mock_update_context):
    """Age save should not override manual age range preferences."""
    update, context = mock_update_context
    update.message.text = "30"

    prefs = profile_handler_module.Preferences(min_age=20, max_age=25)
    existing_user = MagicMock()
    existing_user.preferences = prefs
    updated_user = MagicMock()
    updated_user.preferences = prefs

    mock_dependencies["get_user"].side_effect = [existing_user, updated_user, updated_user, updated_user]

    with patch.object(profile_handler_module, "update_user_preferences") as mock_update_prefs:
        success = await profile_handler_module._save_age(update, context, "30")

    assert success is True
    mock_update_prefs.assert_not_called()


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


@pytest.mark.asyncio
async def test_send_message_safe_uses_effective_message_when_available(profile_handler_module, mock_update_context):
    """Test _send_message_safe uses effective_message.reply_text when available."""
    update, context = mock_update_context
    update.effective_message = update.message  # Ensure effective_message is set

    result = await profile_handler_module._send_message_safe(update, context, "Test message")

    assert result is True
    update.effective_message.reply_text.assert_called_once_with("Test message", reply_markup=None)


@pytest.mark.asyncio
async def test_send_message_safe_falls_back_to_bot_send_message(profile_handler_module, mock_update_context):
    """Test _send_message_safe falls back to context.bot.send_message when effective_message is None."""
    update, context = mock_update_context

    # Simulate callback query with inaccessible message (effective_message is None)
    update.effective_message = None
    update.effective_chat = MagicMock()
    update.effective_chat.id = 12345

    # Mock context.bot.send_message
    context.bot = MagicMock()
    context.bot.send_message = AsyncMock()

    result = await profile_handler_module._send_message_safe(update, context, "Test message")

    assert result is True
    context.bot.send_message.assert_called_once_with(chat_id=12345, text="Test message", reply_markup=None)


@pytest.mark.asyncio
async def test_send_message_safe_uses_effective_user_as_fallback(profile_handler_module, mock_update_context):
    """Test _send_message_safe uses effective_user.id when effective_message and effective_chat are None."""
    update, context = mock_update_context

    # Simulate callback query with inaccessible message
    update.effective_message = None
    update.effective_chat = None
    update.effective_user = MagicMock()
    update.effective_user.id = 12345

    # Mock context.bot.send_message
    context.bot = MagicMock()
    context.bot.send_message = AsyncMock()

    result = await profile_handler_module._send_message_safe(update, context, "Test message")

    assert result is True
    context.bot.send_message.assert_called_once_with(chat_id=12345, text="Test message", reply_markup=None)


@pytest.mark.asyncio
async def test_send_message_safe_uses_callback_query_message_chat(profile_handler_module, mock_update_context):
    """Test _send_message_safe extracts chat_id from callback_query.message.chat when others are None."""
    update, context = mock_update_context

    # Simulate callback query with accessible message but None effective_message (edge case)
    update.effective_message = None
    update.effective_chat = None
    update.effective_user = None
    update.callback_query = MagicMock()
    update.callback_query.message = MagicMock()
    update.callback_query.message.chat = MagicMock()
    update.callback_query.message.chat.id = 12345

    # Mock context.bot.send_message
    context.bot = MagicMock()
    context.bot.send_message = AsyncMock()

    result = await profile_handler_module._send_message_safe(update, context, "Test message")

    assert result is True
    context.bot.send_message.assert_called_once_with(chat_id=12345, text="Test message", reply_markup=None)


@pytest.mark.asyncio
async def test_send_message_safe_returns_false_when_no_chat_id_available(profile_handler_module, mock_update_context):
    """Test _send_message_safe returns False when no chat_id can be determined."""
    update, context = mock_update_context

    # Simulate complete failure to get chat_id
    update.effective_message = None
    update.effective_chat = None
    update.effective_user = None
    update.callback_query = None

    result = await profile_handler_module._send_message_safe(update, context, "Test message")

    assert result is False


@pytest.mark.asyncio
async def test_prompt_for_next_missing_field_works_with_callback_query(
    profile_handler_module, mock_dependencies, mock_update_context
):
    """Test prompt_for_next_missing_field works when called from callback query context.

    This is the critical test for the new user onboarding flow:
    After setting region/language via callbacks, the profile prompt should be shown
    even if effective_message is None (which can happen with inaccessible messages).
    """
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Simulate callback query context where effective_message might be inaccessible
    update.effective_message = None
    update.effective_chat = MagicMock()
    update.effective_chat.id = 12345

    # Mock context.bot.send_message
    context.bot = MagicMock()
    context.bot.send_message = AsyncMock()

    # Mock user with missing age (required field)
    mock_user = MagicMock()
    mock_user.first_name = "Test"
    mock_user.age = None
    mock_user.photos = ["photo.jpg"]
    mock_user.gender = None
    mock_user.bio = None
    mock_user.interests = []
    mock_user.location = None
    mock_user.is_profile_complete = False
    mock_deps["get_user"].return_value = mock_user

    result = await profile_handler_module.prompt_for_next_missing_field(update, context, "12345")

    assert result is True
    assert context.user_data.get("awaiting_age") is True
    # Verify messages were sent via bot.send_message
    assert context.bot.send_message.called
