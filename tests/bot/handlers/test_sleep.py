"""Tests for sleep/pause handlers."""

import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, ReplyKeyboardRemove, Update, User
from telegram.ext import ContextTypes


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.sleep",
        "src.services.user_service",
        "src.utils.cache",
        "src.utils.database",
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
def sleep_handler_module():
    """Import and reload the sleep handler module."""
    import src.bot.handlers.sleep as module

    importlib.reload(module)
    return module


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_message = AsyncMock(spec=Message)
    update.message = AsyncMock(spec=Message)
    update.message.text = "/sleep"

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    return update, context


@pytest.mark.asyncio
async def test_sleep_command_success(sleep_handler_module, mock_update_context):
    """Test sleep command when user is not sleeping."""
    update, context = mock_update_context

    mock_user = MagicMock()
    mock_user.is_sleeping = False

    with (
        patch.object(sleep_handler_module, "get_user", return_value=mock_user) as mock_get_user,
        patch.object(sleep_handler_module, "set_user_sleeping") as mock_set_sleeping,
        patch.object(sleep_handler_module, "authenticated", lambda f: f),
    ):
        # Need to reload the function after patching the decorator
        # Instead, we call the underlying function directly by accessing __wrapped__
        # But the decorator is applied at module load time, so let's just call the function
        # and mock get_user and set_user_sleeping

        await sleep_handler_module.sleep_command.__wrapped__(update, context)

        mock_get_user.assert_called_once_with("12345")
        mock_set_sleeping.assert_called_once_with("12345", True)
        update.message.reply_text.assert_called_once()
        args, kwargs = update.message.reply_text.call_args
        assert "You are now in sleep mode" in args[0]
        assert isinstance(kwargs.get("reply_markup"), ReplyKeyboardRemove)


@pytest.mark.asyncio
async def test_sleep_command_already_sleeping(sleep_handler_module, mock_update_context):
    """Test sleep command when user is already sleeping."""
    update, context = mock_update_context

    mock_user = MagicMock()
    mock_user.is_sleeping = True

    with (
        patch.object(sleep_handler_module, "get_user", return_value=mock_user),
        patch.object(sleep_handler_module, "set_user_sleeping") as mock_set_sleeping,
    ):
        await sleep_handler_module.sleep_command.__wrapped__(update, context)

        mock_set_sleeping.assert_not_called()
        update.message.reply_text.assert_called_once()
        args, _ = update.message.reply_text.call_args
        assert "already in sleep mode" in args[0]


@pytest.mark.asyncio
async def test_sleep_command_no_user(sleep_handler_module):
    """Test sleep command with no effective user."""
    update = MagicMock(spec=Update)
    update.effective_user = None
    update.message = AsyncMock(spec=Message)

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    with patch.object(sleep_handler_module, "get_user") as mock_get_user:
        await sleep_handler_module.sleep_command.__wrapped__(update, context)

        mock_get_user.assert_not_called()


@pytest.mark.asyncio
async def test_wake_up_user_sleeping(sleep_handler_module, mock_update_context):
    """Test wake_up_user when user is sleeping."""
    update, context = mock_update_context

    mock_user = MagicMock()
    mock_user.is_sleeping = True

    woken_user = MagicMock()
    woken_user.is_sleeping = False

    with (
        patch.object(sleep_handler_module, "get_user", return_value=mock_user),
        patch.object(sleep_handler_module, "wake_user", return_value=woken_user) as mock_wake_user,
    ):
        result = await sleep_handler_module.wake_up_user(update, context)

        assert result is True
        mock_wake_user.assert_called_once_with("12345")
        update.effective_message.reply_text.assert_called_once()
        args, _ = update.effective_message.reply_text.call_args
        assert "Welcome back" in args[0]


@pytest.mark.asyncio
async def test_wake_up_user_not_sleeping(sleep_handler_module, mock_update_context):
    """Test wake_up_user when user is not sleeping."""
    update, context = mock_update_context

    mock_user = MagicMock()
    mock_user.is_sleeping = False

    with (
        patch.object(sleep_handler_module, "get_user", return_value=mock_user),
        patch.object(sleep_handler_module, "wake_user") as mock_wake_user,
    ):
        result = await sleep_handler_module.wake_up_user(update, context)

        assert result is False
        mock_wake_user.assert_not_called()


@pytest.mark.asyncio
async def test_wake_up_user_no_effective_user(sleep_handler_module):
    """Test wake_up_user with no effective user."""
    update = MagicMock(spec=Update)
    update.effective_user = None

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)

    with patch.object(sleep_handler_module, "get_user") as mock_get_user:
        result = await sleep_handler_module.wake_up_user(update, context)

        assert result is False
        mock_get_user.assert_not_called()
