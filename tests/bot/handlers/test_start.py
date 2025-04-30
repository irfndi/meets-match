import unittest
from unittest.mock import AsyncMock, call, patch

import pytest

from src.bot.handlers.start import REGISTRATION_MESSAGE, WELCOME_MESSAGE, start_command
from src.utils.errors import NotFoundError

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio


async def test_start_command_new_user(mock_settings, mock_update, mock_context):
    """Test start_command handler for a new user."""
    # Arrange
    user_id = mock_update.effective_user.id
    mock_context.bot_data = {"env": mock_settings}

    # Mock service functions
    with (
        patch("src.bot.handlers.start.get_user", new_callable=AsyncMock) as mock_get_user,
        patch("src.bot.handlers.start.create_user", new_callable=AsyncMock) as mock_create_user,
        patch("src.bot.handlers.start.update_user", new_callable=AsyncMock) as mock_update_user,
    ):
        mock_get_user.side_effect = NotFoundError("User not found")

        # Mock telegram update methods
        mock_update.message.reply_text = AsyncMock()

        # Act
        await start_command(mock_update, mock_context)

        # Assert
        mock_get_user.assert_awaited_once_with(mock_settings, str(user_id))
        mock_create_user.assert_awaited_once()
        # Check the second argument (user_data dictionary) passed to create_user
        call_args, _ = mock_create_user.call_args
        assert call_args[0] == mock_settings
        assert call_args[1]["id"] == str(user_id)
        assert call_args[1]["username"] == mock_update.effective_user.username
        assert call_args[1]["first_name"] == mock_update.effective_user.first_name
        assert call_args[1]["is_active"] is True

        mock_update_user.assert_not_awaited()

        # Check that reply_text was called twice with correct messages
        assert mock_update.message.reply_text.await_count == 2
        expected_calls = [
            call(WELCOME_MESSAGE),
            call(REGISTRATION_MESSAGE, reply_markup=unittest.mock.ANY),  # Ignore reply_markup for simplicity
        ]
        mock_update.message.reply_text.assert_has_awaits(expected_calls, any_order=False)
