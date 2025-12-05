from unittest.mock import MagicMock, patch

import pytest

from src.bot.application import BotApplication
from src.config import settings
from tests.mocks.telegram import MockUpdate


@pytest.mark.asyncio
async def test_bot_error_handler_reports_to_sentry(mock_update, mock_context):
    """Unexpected errors should be reported to Sentry with user/update context."""

    # Ensure Sentry path is taken
    settings.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0"

    # Provide a to_dict() to serialize the update
    mock_update.to_dict = lambda: {"update_id": mock_update.update_id}

    error = Exception("boom")
    mock_context.error = error

    scope = MagicMock()
    scope_cm = MagicMock()
    scope_cm.__enter__.return_value = scope
    scope_cm.__exit__.return_value = False

    with (
        patch("src.bot.application.sentry_sdk.push_scope", return_value=scope_cm) as mock_push_scope,
        patch("src.bot.application.sentry_sdk.capture_exception") as mock_capture_exception,
        patch("src.bot.application.Update", MockUpdate),
    ):
        app = BotApplication()
        await app._error_handler(mock_update, mock_context)

    mock_push_scope.assert_called_once()
    mock_capture_exception.assert_called_once_with(error)
    scope.set_user.assert_called_once_with(
        {"id": mock_update.effective_user.id, "username": mock_update.effective_user.username}
    )
    scope.set_extra.assert_called_once_with("update", {"update_id": mock_update.update_id})
    mock_context.bot.send_message.assert_awaited_once()
