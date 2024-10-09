import pytest
from unittest.mock import AsyncMock, MagicMock
from bot.handlers.preferences_handler import set_preferences

@pytest.mark.asyncio
async def test_set_preferences():
    update = AsyncMock()
    context = MagicMock()
    context.user_data = {}  # Initialize user_data as a dictionary

    await set_preferences(update, context)

    update.message.reply_text.assert_called_once_with("Let's set your preferences! What's your preferred age range? (e.g., 25-35)")
    assert context.user_data['preference_setting_step'] == 'age_range'

# Add more tests for handle_preference_input and other preference-related functions