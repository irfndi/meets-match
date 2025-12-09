import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import CallbackQuery, Message, Update, User
from telegram.ext import ContextTypes


# Fixture to provide the match module with mocked dependencies
@pytest.fixture
def match_module():
    # Ensure src.bot.middleware is mocked
    mock_middleware = MagicMock()
    mock_middleware.authenticated = lambda x: x
    mock_middleware.profile_required = lambda x: x
    mock_middleware.user_command_limiter = MagicMock(return_value=AsyncMock())

    with patch.dict(sys.modules, {"src.bot.middleware": mock_middleware}):
        if "src.bot.handlers.match" in sys.modules:
            del sys.modules["src.bot.handlers.match"]

        import src.bot.handlers.match as mm

        yield mm


@pytest.fixture
def mock_update_context():
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.message = AsyncMock(spec=Message)
    update.message.chat_id = 12345
    update.message.text = "test"
    update.message.reply_text = AsyncMock()
    update.effective_message = update.message

    update.callback_query = MagicMock(spec=CallbackQuery)
    update.callback_query.data = "test"
    update.callback_query.answer = AsyncMock()
    update.callback_query.edit_message_text = AsyncMock()
    update.callback_query.message = update.message

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}
    context.bot = MagicMock()
    context.bot.send_message = AsyncMock()
    context.bot.send_media_group = AsyncMock()

    return update, context


@pytest.mark.asyncio
async def test_handle_like_mutual_notification(match_module, mock_update_context):
    update, context = mock_update_context
    match_id = "match123"

    # Mock match and users
    mock_match = MagicMock()
    mock_match.user1_id = "12345"
    mock_match.user2_id = "target_user"

    mock_target_user = MagicMock()
    mock_target_user.id = "target_user"
    mock_target_user.first_name = "Target"

    mock_current_user = MagicMock()
    mock_current_user.id = "12345"
    mock_current_user.first_name = "Me"

    # Mock services
    with (
        patch.object(match_module, "get_match_by_id", return_value=mock_match),
        patch.object(
            match_module, "get_user", side_effect=lambda uid: mock_current_user if uid == "12345" else mock_target_user
        ),
        patch.object(match_module, "like_match", return_value=True),
        patch.object(match_module, "get_cache", return_value=None),
    ):  # Not editing
        await match_module.handle_like(update, context, match_id)

        # Verify notification sent to target user
        context.bot.send_message.assert_called()
        _args, kwargs = context.bot.send_message.call_args
        assert kwargs["chat_id"] == "target_user"
        assert "matched with Me" in kwargs["text"]


@pytest.mark.asyncio
async def test_handle_like_mutual_notification_target_editing(match_module, mock_update_context):
    update, context = mock_update_context
    match_id = "match123"

    mock_match = MagicMock()
    mock_match.user1_id = "12345"
    mock_match.user2_id = "target_user"

    mock_target_user = MagicMock()
    mock_target_user.id = "target_user"

    with (
        patch.object(match_module, "get_match_by_id", return_value=mock_match),
        patch.object(match_module, "get_user"),
        patch.object(match_module, "like_match", return_value=True),
        patch.object(match_module, "get_cache", return_value="1"),
    ):  # Is editing
        await match_module.handle_like(update, context, match_id)

        # Verify notification NOT sent
        context.bot.send_message.assert_not_called()


@pytest.mark.asyncio
async def test_show_matches_page_limit_free(match_module, mock_update_context):
    update, context = mock_update_context
    page = 2  # offset 10 (limit 5)

    mock_user = MagicMock()
    mock_user.preferences = MagicMock()
    mock_user.preferences.premium_tier = "free"

    mock_settings = MagicMock()
    mock_settings.ADMIN_IDS = ""

    with (
        patch.object(match_module, "get_user", return_value=mock_user),
        patch.object(match_module, "settings", mock_settings),
        patch.object(match_module, "get_active_matches") as mock_get_matches,
    ):
        await match_module.show_matches_page(update, context, page)

        # Should show limit reached message
        update.callback_query.edit_message_text.assert_called()
        args = update.callback_query.edit_message_text.call_args[0][0]
        assert "Limit Reached" in args
        mock_get_matches.assert_not_called()


@pytest.mark.asyncio
async def test_matches_pagination_callback_new_matches(match_module, mock_update_context):
    update, context = mock_update_context
    update.callback_query.data = "new_matches"

    with patch.object(match_module, "match_command") as mock_match_command:
        await match_module.matches_pagination_callback(update, context)

        update.callback_query.delete_message.assert_called()
        mock_match_command.assert_called()


@pytest.mark.asyncio
async def test_show_matches_page_admin_unlimited(match_module, mock_update_context):
    update, context = mock_update_context
    update.effective_user.id = 999
    page = 10

    mock_user = MagicMock()
    mock_user.id = "999"
    mock_user.preferences = None

    mock_settings = MagicMock()
    mock_settings.ADMIN_IDS = "999"

    # Mock matches return empty to avoid rendering logic but prove we got past check
    with (
        patch.object(match_module, "get_user", return_value=mock_user),
        patch.object(match_module, "settings", mock_settings),
        patch.object(match_module, "get_active_matches", return_value=[]),
    ):
        await match_module.show_matches_page(update, context, page)

        update.callback_query.edit_message_text.assert_called()
        args = update.callback_query.edit_message_text.call_args[0][0]
        # Should NOT be limit reached message, but "You don't have active matches" or empty list
        assert "Limit Reached" not in args
