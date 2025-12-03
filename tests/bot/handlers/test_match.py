import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import CallbackQuery, Chat, Message, Update, User
from telegram.ext import ContextTypes


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.match",
        "src.services.matching_service",
        "src.services.user_service",
        "src.models.user",
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
def mock_middleware_fix():
    """Mock the middleware module to provide a pass-through authenticated decorator."""
    mock_mod = MagicMock()

    def pass_through(func):
        return func

    mock_mod.authenticated = pass_through
    mock_mod.profile_required = pass_through
    mock_mod.user_command_limiter = MagicMock(return_value=AsyncMock())

    with patch.dict(sys.modules, {"src.bot.middleware": mock_mod}):
        yield mock_mod


@pytest.fixture
def match_handler_module(mock_middleware_fix):
    return importlib.import_module("src.bot.handlers.match")


@pytest.fixture
def mock_dependencies(match_handler_module):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_get_potential = MagicMock()
    mock_get_match_by_id = MagicMock()
    mock_like_match = MagicMock()
    mock_dislike_match = MagicMock()
    mock_get_active = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())

    # Mock cache
    mock_get_cache = MagicMock()
    mock_set_cache = MagicMock()

    # Mock UI helpers
    mock_create_match = MagicMock()

    with (
        patch.object(match_handler_module, "get_user", mock_get_user),
        patch.object(match_handler_module, "get_potential_matches", mock_get_potential),
        patch.object(match_handler_module, "get_match_by_id", mock_get_match_by_id),
        patch.object(match_handler_module, "create_match", mock_create_match),
        patch.object(match_handler_module, "like_match", mock_like_match),
        patch.object(match_handler_module, "dislike_match", mock_dislike_match),
        patch.object(match_handler_module, "get_active_matches", mock_get_active),
        patch.object(match_handler_module, "user_command_limiter", mock_limiter),
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
            "get_active_matches": mock_get_active,
            "limiter": mock_limiter,
            "get_cache": mock_get_cache,
            "set_cache": mock_set_cache,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_chat = MagicMock(spec=Chat)
    update.effective_chat.id = 12345

    update.message = AsyncMock(spec=Message)
    update.message.reply_text = AsyncMock()

    update.callback_query = AsyncMock(spec=CallbackQuery)
    update.callback_query.data = None
    update.callback_query.answer = AsyncMock()
    update.callback_query.edit_message_text = AsyncMock()
    update.callback_query.message = AsyncMock(spec=Message)
    update.callback_query.delete_message = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}
    context.bot = AsyncMock()
    context.bot.send_message = AsyncMock()

    return update, context


@pytest.mark.asyncio
async def test_match_command_no_matches(match_handler_module, mock_dependencies, mock_update_context):
    """Test /match command with no matches."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock user and no potential matches
    mock_deps["get_user"].return_value = MagicMock()
    mock_deps["get_potential_matches"].return_value = []

    await match_handler_module.match_command(update, context)

    # Verify no matches message
    update.message.reply_text.assert_called()
    assert "No potential matches found" in update.message.reply_text.call_args[0][0]


@pytest.mark.asyncio
async def test_match_command_with_match_and_media(
    match_handler_module, mock_dependencies, mock_update_context, tmp_path
):
    """Test /match command with a match that has media."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock user
    mock_user = MagicMock()
    mock_user.first_name = "Jane"
    mock_user.age = 25
    mock_user.gender.value = "Female"
    mock_user.bio = "Hello"
    mock_user.interests = ["Music"]
    mock_user.location.city = "Jakarta"
    mock_user.location.country = "Indonesia"

    mock_deps["get_user"].return_value = mock_user

    # Create dummy media files
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    photo_file = media_dir / "photo.jpg"
    photo_file.write_bytes(b"fake image data")
    video_file = media_dir / "video.mp4"
    video_file.write_bytes(b"fake video data")

    # Mock potential match (User object) with media
    mock_match_user = MagicMock()
    mock_match_user.id = "67890"
    mock_match_user.first_name = "Jane"
    mock_match_user.age = 25
    mock_match_user.gender.value = "Female"
    mock_match_user.bio = "Hello"
    mock_match_user.interests = ["Music"]
    mock_match_user.location.city = "Jakarta"
    mock_match_user.location.country = "Indonesia"
    # Photos are stored as relative paths
    mock_match_user.photos = ["photo.jpg", "video.mp4"]

    mock_deps["get_potential_matches"].return_value = [mock_match_user]

    # Mock create_match return value
    mock_created_match = MagicMock()
    mock_created_match.id = "match_abc"
    mock_deps["create_match"].return_value = mock_created_match

    # Patch get_storage_path to return our temp dir
    with patch("src.bot.media_sender.get_storage_path", return_value=media_dir):
        await match_handler_module.match_command(update, context)

    # Verify media group sent
    update.message.reply_media_group.assert_called_once()
    media_args = update.message.reply_media_group.call_args[1]["media"]
    assert len(media_args) == 2
    # Check types (indirectly via checking if they are InputMedia objects)
    # We can't easily check exact types without importing them, but we can check attributes if needed.
    # Or just rely on the fact that it was called.

    # Verify match profile sent (text)
    update.message.reply_text.assert_called()
    args, kwargs = update.message.reply_text.call_args
    assert "Jane" in args[0]
    assert "Jakarta" in args[0]
    assert "reply_markup" in kwargs


@pytest.mark.asyncio
async def test_match_command_with_match(match_handler_module, mock_dependencies, mock_update_context):
    """Test /match command with a match."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock user
    mock_user = MagicMock()
    mock_user.first_name = "Jane"
    mock_user.age = 25
    mock_user.gender.value = "Female"
    mock_user.bio = "Hello"
    mock_user.interests = ["Music"]
    mock_user.location.city = "Jakarta"
    mock_user.location.country = "Indonesia"

    mock_deps["get_user"].return_value = mock_user

    # Mock potential match (User object)
    mock_match_user = MagicMock()
    mock_match_user.id = "67890"
    mock_match_user.first_name = "Jane"
    mock_match_user.age = 25
    mock_match_user.gender.value = "Female"
    mock_match_user.bio = "Hello"
    mock_match_user.interests = ["Music"]
    mock_match_user.location.city = "Jakarta"
    mock_match_user.location.country = "Indonesia"

    mock_deps["get_potential_matches"].return_value = [mock_match_user]

    # Mock create_match return value
    mock_created_match = MagicMock()
    mock_created_match.id = "match_abc"
    mock_deps["create_match"].return_value = mock_created_match

    await match_handler_module.match_command(update, context)

    # Verify match profile sent
    update.message.reply_text.assert_called()
    args, kwargs = update.message.reply_text.call_args
    assert "Jane" in args[0]
    assert "Jakarta" in args[0]
    assert "reply_markup" in kwargs


@pytest.mark.asyncio
async def test_handle_like_match(match_handler_module, mock_dependencies, mock_update_context):
    """Test liking a match."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    update.callback_query.data = "like_match_123"

    # Mock target user
    mock_target = MagicMock()
    mock_target.first_name = "Jane"
    mock_target.id = "target_123"
    mock_deps["get_user"].return_value = mock_target

    # Mock match retrieval
    mock_match = MagicMock()
    mock_match.id = "match_123"
    mock_match.user1_id = "12345"
    mock_match.user2_id = "target_123"
    mock_deps["get_match_by_id"].return_value = mock_match

    # Mock like (not mutual)
    mock_deps["like_match"].return_value = False

    await match_handler_module.match_callback(update, context)

    # Verify like_match called
    mock_deps["like_match"].assert_called_with("match_123")

    # Verify confirmation message
    update.callback_query.edit_message_text.assert_called()
    assert "You liked Jane" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_handle_mutual_match(match_handler_module, mock_dependencies, mock_update_context):
    """Test mutual match."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    update.callback_query.data = "like_match_123"

    # Mock target user
    mock_target = MagicMock()
    mock_target.first_name = "Jane"
    mock_target.id = "target_123"
    mock_deps["get_user"].return_value = mock_target

    # Mock match retrieval
    mock_match = MagicMock()
    mock_match.id = "match_123"
    mock_match.user1_id = "12345"
    mock_match.user2_id = "target_123"
    mock_deps["get_match_by_id"].return_value = mock_match

    # Mock like (mutual)
    mock_deps["like_match"].return_value = True

    await match_handler_module.match_callback(update, context)

    # Verify confirmation message
    update.callback_query.edit_message_text.assert_called()
    assert "It's a match!" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_matches_command_list(match_handler_module, mock_dependencies, mock_update_context):
    """Test /matches command listing matches."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock user
    mock_user = MagicMock()
    mock_deps["get_user"].return_value = mock_user

    # Mock active matches
    mock_match = MagicMock()
    mock_match.id = "match_123"
    mock_match.user1_id = "12345"
    mock_match.user2_id = "67890"

    mock_deps["get_active_matches"].return_value = [mock_match]

    # Mock match user details (called inside show_matches_page loop)
    # The first call to get_user is for the current user (for tier check)
    # Subsequent calls are for match users
    mock_match_user = MagicMock()
    mock_match_user.first_name = "Jane"
    mock_match_user.age = 25

    mock_deps["get_user"].side_effect = [mock_user, mock_match_user]

    # Simulate message command (no callback)
    update.callback_query = None

    await match_handler_module.matches_command(update, context)

    # Verify matches list sent
    update.message.reply_text.assert_called()
    assert "Your Active Matches" in update.message.reply_text.call_args[0][0]
    assert "Jane" in update.message.reply_text.call_args[0][0]


@pytest.mark.asyncio
async def test_handle_view_match_with_media(match_handler_module, mock_dependencies, mock_update_context, tmp_path):
    """Test viewing a match profile with media via callback."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock callback query
    update.callback_query.data = "view_match_match_123"
    update.callback_query.message.chat_id = 12345

    # Mock match
    mock_match = MagicMock()
    mock_match.id = "match_123"
    mock_match.user1_id = "12345"
    mock_match.user2_id = "67890"
    mock_match.status = "matched"  # Use string or enum if available, but string might fail if logic checks Enum
    # Logic checks: if match.status == MatchStatus.MATCHED:
    # So we should use the real enum or mock it correctly.
    # Since we imported match_handler_module, we can use match_handler_module.MatchStatus.MATCHED

    # We need to import MatchStatus from src.models.match, but the test file doesn't import it.
    # However, we can mock the attribute access or import it inside test.
    # Let's try to import it if possible, or just use MagicMock for status.
    mock_match.status = match_handler_module.MatchStatus.MATCHED

    mock_deps["get_match_by_id"].return_value = mock_match

    # Create dummy media files
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    photo_file = media_dir / "photo.jpg"
    photo_file.write_bytes(b"fake image data")

    # Mock target user with media
    mock_target_user = MagicMock()
    mock_target_user.id = "67890"
    mock_target_user.first_name = "Jane"
    mock_target_user.age = 25
    mock_target_user.gender.value = "Female"
    mock_target_user.bio = "Hello"
    mock_target_user.interests = ["Music"]
    mock_target_user.location.city = "Jakarta"
    mock_target_user.location.country = "Indonesia"
    mock_target_user.photos = ["photo.jpg"]

    mock_deps["get_user"].return_value = mock_target_user

    # Patch get_storage_path to return our temp dir
    with patch("src.bot.media_sender.get_storage_path", return_value=media_dir):
        await match_handler_module.match_callback(update, context)

    # Verify media group sent
    context.bot.send_media_group.assert_called_once()
    call_args = context.bot.send_media_group.call_args[1]
    assert call_args["chat_id"] == 12345
    assert len(call_args["media"]) == 1

    # Verify profile message sent (text)
    context.bot.send_message.assert_called()
    _, kwargs = context.bot.send_message.call_args
    assert "Jane" in kwargs["text"]
    assert "Jakarta" in kwargs["text"]
    assert "reply_markup" in kwargs
