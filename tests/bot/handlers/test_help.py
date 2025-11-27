import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update
from telegram.ext import ContextTypes


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.help",
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
def help_handler_module():
    return importlib.import_module("src.bot.handlers.help")


@pytest.fixture
def mock_dependencies(help_handler_module):
    """Mock external dependencies."""
    mock_limiter = MagicMock(return_value=AsyncMock())  # Returns an async function
    mock_main_menu = MagicMock()

    with (
        patch.object(help_handler_module, "user_command_limiter", mock_limiter),
        patch.object(help_handler_module, "main_menu", mock_main_menu),
    ):
        yield {"limiter": mock_limiter, "main_menu": mock_main_menu}


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)

    update.message = AsyncMock(spec=Message)
    update.message.reply_text = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)

    return update, context


@pytest.mark.asyncio
async def test_help_command(help_handler_module, mock_dependencies, mock_update_context):
    """Test help command."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    await help_handler_module.help_command(update, context)

    # Verify limiter called
    mock_deps["limiter"].assert_called()

    # Verify message sent
    update.message.reply_text.assert_called()
    args, kwargs = update.message.reply_text.call_args
    assert "MeetMatch Bot Help" in args[0]
    assert kwargs["parse_mode"] == "Markdown"
    assert "reply_markup" in kwargs
    mock_deps["main_menu"].assert_called()


@pytest.mark.asyncio
async def test_about_command(help_handler_module, mock_dependencies, mock_update_context):
    """Test about command."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    await help_handler_module.about_command(update, context)

    # Verify limiter called
    mock_deps["limiter"].assert_called()

    # Verify message sent
    update.message.reply_text.assert_called()
    args, kwargs = update.message.reply_text.call_args
    assert "About MeetMatch" in args[0]
    assert kwargs["parse_mode"] == "Markdown"
