from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# from telegram import Update
# from telegram.ext import ContextTypes


@pytest.mark.asyncio
async def test_handle_message_to_matched_user():
    context = MagicMock()
    context.bot.send_message = AsyncMock()
    # Mock retrieval of matched user pair
    # Mock successful message forwarding

    # await handle_message(update, context)

    # Assert context.bot.send_message called for the other user
    pytest.skip("Test not implemented yet")


@pytest.mark.asyncio
async def test_handle_message_not_matched():
    # Mock so no match is found for the user
    with patch("src.services.matching_service.get_active_matches", new_callable=AsyncMock) as _:
        pass  # No action needed inside the patch for this test logic
    # await handle_message(update, context)

    # Assert NO message is sent/forwarded (or perhaps an error/info message?)
    pytest.skip("Test not implemented yet")


# Add tests for handle_unmatch_callback, error handling during message sending,
# different chat states, etc.
