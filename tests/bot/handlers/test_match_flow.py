import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import CallbackQuery, Message, Update, User
from telegram.ext import ContextTypes

from src.models.user import Gender, Location
from src.models.user import User as UserModel


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.match",
        "src.services.matching_service",
        "src.services.user_service",
        "src.models.user",
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
    """Mock the middleware module."""
    mock_mod = MagicMock()
    mock_mod.authenticated = lambda func: func
    mock_mod.profile_required = lambda func: func
    mock_mod.user_command_limiter = MagicMock(return_value=AsyncMock())

    with patch.dict(sys.modules, {"src.bot.middleware": mock_mod}):
        yield mock_mod


@pytest.fixture
def match_handler_module(mock_middleware_fix):
    return importlib.import_module("src.bot.handlers.match")


@pytest.fixture
def mock_current_user():
    """Mock the current user calling the bot."""
    user = MagicMock(spec=UserModel)
    user.id = "12345"
    user.first_name = "TestUser"
    user.preferences = MagicMock()
    user.preferences.premium_tier = "free"
    return user


@pytest.fixture
def mock_potential_match():
    """Mock a potential match user."""
    user = MagicMock(spec=UserModel)
    user.id = "67890"
    user.first_name = "Alice"
    user.age = 25
    user.gender = Gender.FEMALE
    user.bio = "Loves hiking and coding."
    user.interests = ["Hiking", "Coding"]
    user.location = Location(latitude=0.0, longitude=0.0, city="Wonderland", country="Magic")
    user.photos = ["alice.jpg"]
    return user


@pytest.fixture
def mock_dependencies(match_handler_module, mock_current_user, mock_potential_match):
    """Mock external dependencies."""

    def get_user_side_effect(user_id):
        if user_id == "12345":
            return mock_current_user
        elif user_id == "67890":
            return mock_potential_match
        return None

    mock_get_user = MagicMock(side_effect=get_user_side_effect)
    mock_get_potential = MagicMock(return_value=[mock_potential_match])

    mock_match = MagicMock()
    mock_match.id = "match_abc123"
    mock_match.user1_id = "12345"
    mock_match.user2_id = "67890"

    mock_get_match_by_id = MagicMock(return_value=mock_match)
    mock_create_match = MagicMock(return_value=mock_match)
    mock_like_match = MagicMock()
    mock_dislike_match = MagicMock()
    mock_get_active = MagicMock()
    mock_get_cache = MagicMock(return_value=None)
    mock_set_cache = MagicMock()

    with (
        patch.object(match_handler_module, "get_user", mock_get_user),
        patch.object(match_handler_module, "get_potential_matches", mock_get_potential),
        patch.object(match_handler_module, "get_match_by_id", mock_get_match_by_id),
        patch.object(match_handler_module, "create_match", mock_create_match),
        patch.object(match_handler_module, "like_match", mock_like_match),
        patch.object(match_handler_module, "dislike_match", mock_dislike_match),
        patch.object(match_handler_module, "get_active_matches", mock_get_active),
        patch.object(match_handler_module, "get_cache", mock_get_cache),
        patch.object(match_handler_module, "set_cache", mock_set_cache),
    ):
        yield {
            "get_user": mock_get_user,
            "get_potential_matches": mock_get_potential,
            "get_match_by_id": mock_get_match_by_id,
            "create_match": mock_create_match,
            "like_match": mock_like_match,
            "dislike_match": mock_dislike_match,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345

    # Message for command
    update.message = AsyncMock(spec=Message)
    update.message.reply_text = AsyncMock()

    # Callback query for interactions
    update.callback_query = AsyncMock(spec=CallbackQuery)
    update.callback_query.data = None
    update.callback_query.message = AsyncMock(spec=Message)
    update.callback_query.edit_message_text = AsyncMock()
    update.callback_query.answer = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    return update, context


@pytest.mark.asyncio
async def test_no_matches_flow(match_handler_module, mock_dependencies, mock_update_context):
    """Test flow when no matches are available."""
    update, context = mock_update_context

    # Setup: No matches returned
    mock_dependencies["get_potential_matches"].return_value = []

    # Execute
    await match_handler_module.match_command(update, context)

    # Verify
    update.message.reply_text.assert_called()
    assert "No potential matches found" in update.message.reply_text.call_args[0][0]


@pytest.mark.asyncio
async def test_match_display_flow(match_handler_module, mock_dependencies, mock_update_context):
    """Test that a match profile is displayed correctly."""
    update, context = mock_update_context

    # Execute
    await match_handler_module.match_command(update, context)

    # Verify
    update.message.reply_text.assert_called()
    msg_text = update.message.reply_text.call_args[0][0]

    assert "Alice" in msg_text
    assert "25" in msg_text
    assert "female" in msg_text
    assert "Wonderland, Magic" in msg_text
    assert "Hiking, Coding" in msg_text

    # Verify buttons
    reply_markup = update.message.reply_text.call_args[1]["reply_markup"]
    assert reply_markup.inline_keyboard[0][0].callback_data == "like_match_abc123"
    assert reply_markup.inline_keyboard[0][1].callback_data == "dislike_match_abc123"


@pytest.mark.asyncio
async def test_like_flow(match_handler_module, mock_dependencies, mock_update_context):
    """Test liking a user."""
    update, context = mock_update_context

    # Setup: User clicks like
    update.callback_query.data = "like_match_abc123"
    mock_dependencies["like_match"].return_value = None  # Not a mutual match yet

    # Execute
    await match_handler_module.match_callback(update, context)

    # Verify service called
    # like_match(match_id)
    mock_dependencies["like_match"].assert_called_with("match_abc123", "12345")

    # Verify response
    update.callback_query.edit_message_text.assert_called()
    assert "You liked Alice" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_dislike_flow(match_handler_module, mock_dependencies, mock_update_context):
    """Test passing on a user."""
    update, context = mock_update_context

    # Setup: User clicks pass
    update.callback_query.data = "dislike_match_abc123"

    # Execute
    await match_handler_module.match_callback(update, context)

    # Verify service called
    # dislike_match(match_id)
    mock_dependencies["dislike_match"].assert_called_with("match_abc123", "12345")

    # Verify response
    update.callback_query.edit_message_text.assert_called()
    assert "You passed on Alice" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_mutual_match_flow(match_handler_module, mock_dependencies, mock_update_context):
    """Test mutual match notification."""
    update, context = mock_update_context

    # Setup: User clicks like, and it IS a match
    update.callback_query.data = "like_match_abc123"
    mock_match = MagicMock()  # The match object returned
    mock_dependencies["like_match"].return_value = mock_match

    # Execute
    await match_handler_module.match_callback(update, context)

    # Verify response
    update.callback_query.edit_message_text.assert_called()
    assert "It's a match!" in update.callback_query.edit_message_text.call_args[0][0]
    assert "Alice" in update.callback_query.edit_message_text.call_args[0][0]
