import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import CallbackQuery, Chat, Message, Update, User
from telegram.ext import ContextTypes

# Helper fixtures (copied/adapted from test_match.py)


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.match",
        "src.services.matching_service",
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
    mock_mod.profile_required = pass_through
    mock_mod.user_command_limiter = MagicMock(return_value=AsyncMock())

    with patch.dict(sys.modules, {"src.bot.middleware": mock_mod}):
        yield mock_mod


@pytest.fixture
def match_handler_module(mock_middleware_fix):
    return importlib.import_module("src.bot.handlers.match")


@pytest.fixture
def mock_dependencies(match_handler_module):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_get_potential = MagicMock()
    mock_like_match = MagicMock()
    mock_dislike_match = MagicMock()
    mock_get_active = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())

    # Mock cache
    mock_get_cache = MagicMock()
    mock_set_cache = MagicMock()

    # Mock UI helpers
    mock_no_matches_menu = MagicMock()
    mock_main_menu = MagicMock()
    mock_skip_match = MagicMock()

    with (
        patch.object(match_handler_module, "get_user", mock_get_user),
        patch.object(match_handler_module, "get_potential_matches", mock_get_potential),
        patch.object(match_handler_module, "like_match", mock_like_match),
        patch.object(match_handler_module, "dislike_match", mock_dislike_match),
        patch.object(match_handler_module, "skip_match", mock_skip_match),
        patch.object(match_handler_module, "get_active_matches", mock_get_active),
        patch.object(match_handler_module, "user_command_limiter", mock_limiter),
        patch.object(match_handler_module, "get_cache", mock_get_cache),
        patch.object(match_handler_module, "set_cache", mock_set_cache),
        patch.object(match_handler_module, "no_matches_menu", mock_no_matches_menu),
        patch.object(match_handler_module, "main_menu", mock_main_menu),
    ):
        yield {
            "get_user": mock_get_user,
            "main_menu": mock_main_menu,
            "skip_match": mock_skip_match,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_chat = MagicMock(spec=Chat)
    update.effective_chat.id = 12345

    update.message = AsyncMock(spec=Message)
    update.message.reply_text = AsyncMock()
    update.message.chat_id = 12345

    update.callback_query = AsyncMock(spec=CallbackQuery)
    update.callback_query.data = None
    update.callback_query.answer = AsyncMock()
    update.callback_query.edit_message_text = AsyncMock()
    update.callback_query.message = AsyncMock(spec=Message)
    update.callback_query.message.chat_id = 12345
    update.callback_query.delete_message = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}
    context.bot = AsyncMock()
    context.bot.send_message = AsyncMock()

    return update, context


@pytest.mark.asyncio
async def test_skip_notification(match_handler_module, mock_dependencies, mock_update_context):
    """Test skipping a match notification."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Simulate 'skip_notification' callback
    update.callback_query.data = "skip_notification_123"

    await match_handler_module.match_callback(update, context)

    # Verify callback answered
    update.callback_query.answer.assert_called_with("Match saved for later!")

    # Verify message edited (removing inline keyboard)
    update.callback_query.edit_message_text.assert_called()
    assert "Match skipped!" in update.callback_query.edit_message_text.call_args[0][0]
    assert update.callback_query.edit_message_text.call_args[1]["reply_markup"] is None

    # Verify follow-up message sent with main menu
    context.bot.send_message.assert_called()
    assert "What would you like to do next?" in context.bot.send_message.call_args[1]["text"]
    assert "reply_markup" in context.bot.send_message.call_args[1]
    # Check if main_menu was called
    mock_deps["main_menu"].assert_called()
