import pytest
from unittest.mock import AsyncMock, MagicMock
from bot.handlers.start import start, setup_handlers
from telegram import Update
from telegram.ext import ContextTypes

@pytest.mark.asyncio
async def test_start():
    update = AsyncMock()
    update.effective_chat.id = 12345  # Mock the chat ID
    context = MagicMock()
    context.bot.send_message = AsyncMock()  # Mock send_message to be async

    await start(update, context)

    expected_reply_markup = {
        'keyboard': [[{'text': 'Option 1'}, {'text': 'Option 2'}], [{'text': 'Help'}]],
        'resize_keyboard': True,
        'one_time_keyboard': True
    }

    context.bot.send_message.assert_called_once_with(
        chat_id=12345, 
        text="Welcome!", 
        reply_markup=expected_reply_markup  # Adjust this based on your implementation
    )

@pytest.mark.asyncio
async def test_setup_handlers():
    application = AsyncMock()
    await setup_handlers(application)
    application.add_handler.assert_called()  # You might want to be more specific in your assertion

# Add similar tests for handle_first_name, handle_last_name, handle_age, handle_gender, handle_bio

# @pytest.mark.asyncio
# async def test_handle_matching():
#     update = AsyncMock()
#     context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
# 
#     await handle_matching(update, context)
# 
#     update.message.reply_text.assert_called_once_with("Matching logic goes here.")
#     # Add assertions based on the expected behavior of handle_matching

# Add more tests for other handlers and functions
