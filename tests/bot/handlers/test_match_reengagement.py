from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, ReplyKeyboardRemove, Update, User
from telegram.ext import ContextTypes

from src.bot.handlers.match import reengagement_response


@pytest.mark.asyncio
async def test_reengagement_response_1():
    # Test "1 🚀" -> match_command
    update = MagicMock(spec=Update)
    update.message = MagicMock(spec=Message)
    update.message.text = "1 🚀"
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 123
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)

    with patch("src.bot.handlers.match.match_command", new_callable=AsyncMock) as mock_match_command:
        await reengagement_response(update, context)

        mock_match_command.assert_called_once_with(update, context)


@pytest.mark.asyncio
async def test_reengagement_response_2():
    # Test "2" -> Dismiss
    update = MagicMock(spec=Update)
    update.message = MagicMock(spec=Message)
    update.message.text = "2"
    update.message.reply_text = AsyncMock()
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 123
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)

    await reengagement_response(update, context)

    update.message.reply_text.assert_called_once()
    args, kwargs = update.message.reply_text.call_args
    assert "Okay" in args[0]
    assert isinstance(kwargs["reply_markup"], ReplyKeyboardRemove)
