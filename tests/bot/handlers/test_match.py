from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import (
    Chat,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    ReplyKeyboardMarkup,
    Update,
    User,
)
from telegram.ext import ContextTypes

from src.bot.handlers.match import (
    MATCH_DISLIKED_MESSAGE,
    MATCH_LIKED_MESSAGE,
    MATCH_PROFILE_TEMPLATE,
    MUTUAL_MATCH_MESSAGE,
    NO_MATCHES_MESSAGE,
    match_callback,
    match_command,
    matches_command,
)
from src.models.match import Match as MatchModel
from src.models.user import User as UserModel
from src.utils.errors import NotFoundError


# Helper to create mock Update and Context for callback queries
def create_callback_mocks(user_id: int, callback_data: str):
    mock_update = MagicMock(spec=Update)
    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_query = MagicMock()
    mock_query.answer = AsyncMock()
    mock_query.edit_message_text = AsyncMock()
    mock_query.delete_message = AsyncMock()
    mock_query.data = callback_data
    mock_update.callback_query = mock_query
    mock_update.effective_user = MagicMock(spec=User, id=user_id)
    mock_context.bot_data = {"env": MagicMock()}
    # Simulate user being authenticated
    mock_user_model = MagicMock(spec=UserModel, id=str(user_id), is_profile_complete=True)
    mock_context.user_data = {"user": mock_user_model}
    return mock_update, mock_context


@patch("src.bot.handlers.match.get_potential_matches", new_callable=AsyncMock)
@patch("src.bot.handlers.match.user_command_limiter")  # Patch the factory
@pytest.mark.asyncio
async def test_match_command_no_matches(
    mock_limiter_factory: MagicMock,  # The factory mock
    mock_get_potential_matches: AsyncMock,
    mocker,  # Use mocker fixture
):
    """Test /match command when no potential matches are found."""
    # --- Setup Mocks ---
    # Mock the limiter factory to return an AsyncMock instance
    mock_limiter_instance = AsyncMock()
    mock_limiter_factory.return_value = mock_limiter_instance

    # Mock middleware functions called by decorators
    mock_auth_get_user = mocker.patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock)
    mock_update_last_active = mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    # Mock user model returned by middleware's get_user
    mock_user_model = MagicMock(spec=UserModel)
    mock_user_model.is_profile_complete = True
    mock_auth_get_user.return_value = mock_user_model

    # Mock service call
    mock_get_potential_matches.return_value = []

    # Mock Telegram objects
    mock_update = MagicMock(spec=Update)
    mock_update.effective_user = MagicMock(spec=User, id=12345)
    mock_update.effective_chat = MagicMock(spec=Chat, id=54321)
    mock_update.message = MagicMock(spec=Message)
    mock_update.message.reply_text = AsyncMock()
    # Ensure effective_message.reply_text is also an AsyncMock for error handling in decorators
    mock_update.effective_message = MagicMock(spec=Message)
    mock_update.effective_message.reply_text = AsyncMock()

    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot_data = {"env": MagicMock()}
    # Simulate @authenticated adding user to context
    mock_context.user_data = {"user": mock_user_model}

    # --- Execute Handler ---
    await match_command(mock_update, mock_context)

    # --- Assertions ---
    # Middleware mocks
    # Called once by @authenticated, once by @profile_required
    assert mock_auth_get_user.await_count == 2
    assert mock_update_last_active.await_count == 2
    # Check arguments of the last call
    mock_update_last_active.assert_awaited_with(mock_context.bot_data["env"], "12345")  # Called by @authenticated

    # Limiter mock (check the instance returned by the factory)
    mock_limiter_factory.assert_called_once()  # Factory called
    mock_limiter_instance.assert_awaited_once_with(mock_update, mock_context)  # Instance awaited

    # Service call mock
    mock_get_potential_matches.assert_awaited_once_with(mock_context.bot_data["env"], "12345")

    # Reply mock
    expected_keyboard = ReplyKeyboardMarkup(
        [
            ["/profile", "/settings"],
            ["/matches", "/help"],
        ],
        resize_keyboard=True,
    )
    mock_update.message.reply_text.assert_awaited_once_with(
        NO_MATCHES_MESSAGE,
        reply_markup=expected_keyboard,
    )


@patch("src.bot.handlers.match.get_potential_matches", new_callable=AsyncMock)
@patch("src.bot.handlers.match.user_command_limiter")  # Patch the factory
@patch("src.bot.handlers.match.get_user", new_callable=AsyncMock)  # Mock get_user used within the handler
@pytest.mark.asyncio
async def test_match_command_with_match(
    mock_handler_get_user: AsyncMock,  # get_user called by handler
    mock_limiter_factory: MagicMock,  # The factory mock
    mock_get_potential_matches: AsyncMock,
    mocker,  # Use mocker fixture
):
    """Test /match command when a potential match is found."""
    # --- Setup Mocks ---
    # Mock the limiter factory to return an AsyncMock instance
    mock_limiter_instance = AsyncMock()
    mock_limiter_factory.return_value = mock_limiter_instance

    # Mock middleware functions called by decorators
    mock_auth_get_user = mocker.patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock)
    mock_update_last_active = mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    # Mock user and middleware behavior
    mock_user_model = MagicMock(spec=UserModel)
    mock_user_model.is_profile_complete = True
    mock_auth_get_user.return_value = mock_user_model  # For @authenticated and @profile_required

    # Mock service calls
    MOCKED_MATCH_ID = "match123"
    MOCKED_TARGET_USER_ID = "67890"
    mock_potential_match = MagicMock(spec=MatchModel)  # Mock Match object
    mock_potential_match.id = MOCKED_MATCH_ID
    mock_potential_match.target_user_id = MOCKED_TARGET_USER_ID
    mock_get_potential_matches.return_value = [mock_potential_match]

    # Mock the user object returned by the get_user call *within* match_command
    mock_matched_user_model = MagicMock(spec=UserModel)
    mock_matched_user_model.first_name = "Matchy"
    mock_matched_user_model.age = 30
    mock_matched_user_model.gender = None  # Test None case
    mock_matched_user_model.bio = "Test Bio"
    mock_matched_user_model.interests = ["Testing", "Python"]
    mock_matched_user_model.location_city = "Testville"
    mock_matched_user_model.location_country = "Testland"
    mock_handler_get_user.return_value = mock_matched_user_model  # Used by handler

    # Mock Telegram objects
    mock_update = MagicMock(spec=Update)
    mock_update.effective_user = MagicMock(spec=User, id=12345)
    mock_update.effective_chat = MagicMock(spec=Chat, id=54321)
    mock_update.message = MagicMock(spec=Message)
    mock_update.message.reply_text = AsyncMock()
    # Ensure effective_message.reply_text is also an AsyncMock for error handling in decorators
    mock_update.effective_message = MagicMock(spec=Message)
    mock_update.effective_message.reply_text = AsyncMock()

    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot_data = {"env": MagicMock()}
    mock_context.user_data = {"user": mock_user_model}  # Needed for @profile_required

    # --- Execute Handler ---
    await match_command(mock_update, mock_context)

    # --- Assertions ---
    # Middleware mocks
    # Called once by @authenticated, once by @profile_required
    assert mock_auth_get_user.await_count == 2
    assert mock_update_last_active.await_count == 2
    # Check arguments of the last call
    mock_update_last_active.assert_awaited_with(mock_context.bot_data["env"], "12345")  # Called by @authenticated

    # Limiter mock (check the instance returned by the factory)
    mock_limiter_factory.assert_called_once()  # Factory called
    mock_limiter_instance.assert_awaited_once_with(mock_update, mock_context)  # Instance awaited

    # Service call mock
    mock_get_potential_matches.assert_awaited_once_with(mock_context.bot_data["env"], "12345")
    mock_handler_get_user.assert_awaited_once_with(mock_context.bot_data["env"], MOCKED_TARGET_USER_ID)  # From handler

    # Calculate expected text based on template and mock data
    expected_text = MATCH_PROFILE_TEMPLATE.format(
        emoji="👤",
        name="Matchy",
        age=30,
        gender_emoji="⚧",
        gender="Not specified",  # Because mock_matched_user_model.gender is None
        bio="Test Bio",
        interests_emoji="📝",
        interests="Testing, Python",
        location_emoji="📍",
        location="Testville, Testland",
    )

    # Construct expected keyboard
    expected_keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("👍 Like", callback_data=f"like_{MOCKED_MATCH_ID}"),
                InlineKeyboardButton("👎 Pass", callback_data=f"dislike_{MOCKED_MATCH_ID}"),
            ],
            [
                InlineKeyboardButton("⏭️ Next", callback_data="next_match"),
            ],
        ]
    )

    # Reply mock
    mock_update.message.reply_text.assert_awaited_once_with(
        expected_text,
        reply_markup=expected_keyboard,
    )


# Test case for incomplete profile
@patch("src.bot.handlers.match.user_command_limiter")  # Patch the factory
@patch("src.bot.handlers.match.get_potential_matches", new_callable=AsyncMock)  # Should not be called
@pytest.mark.asyncio
async def test_match_command_profile_incomplete(
    mock_get_potential_matches: AsyncMock,  # To assert not called
    mock_limiter_factory: MagicMock,  # The factory mock
    mocker,  # Use mocker fixture
):
    """Test /match command when the user's profile is incomplete."""
    # --- Setup Mocks ---
    # Mock the limiter factory to return an AsyncMock instance
    mock_limiter_instance = AsyncMock()
    mock_limiter_factory.return_value = mock_limiter_instance

    # Mock middleware functions called by decorators
    mock_auth_get_user = mocker.patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock)
    mock_update_last_active = mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    # Mock user model returned by middleware's get_user - Profile Incomplete
    mock_user_model = MagicMock(spec=UserModel)
    mock_user_model.is_profile_complete = False  # Key difference
    mock_auth_get_user.return_value = mock_user_model

    # Mock Telegram objects
    mock_update = MagicMock(spec=Update)
    mock_update.effective_user = MagicMock(spec=User, id=12345)
    mock_update.effective_chat = MagicMock(spec=Chat, id=54321)
    mock_update.message = MagicMock(spec=Message)
    mock_update.message.reply_text = AsyncMock()

    mock_update.effective_message = MagicMock(spec=Message)
    mock_update.effective_message.reply_text = AsyncMock()

    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot_data = {"env": MagicMock()}
    # Simulate @authenticated adding user to context
    mock_context.user_data = {"user": mock_user_model}

    # --- Execute Handler ---
    # The @profile_required decorator should catch the incomplete profile
    # and return early, preventing the main handler logic from executing.
    await match_command(mock_update, mock_context)

    # --- Assertions ---
    # Middleware mocks
    # Both decorators run, so both are called twice
    assert mock_auth_get_user.await_count == 2
    assert mock_update_last_active.await_count == 2
    mock_update_last_active.assert_awaited_with(mock_context.bot_data["env"], "12345")

    # Limiter mock (should NOT run because @profile_required exits early)
    # mock_limiter_factory.assert_called_once() # Factory is not called as decorator exits early
    mock_limiter_instance.assert_not_awaited()  # Instance not awaited

    # Service call mock (should NOT be called due to incomplete profile)
    mock_get_potential_matches.assert_not_awaited()

    # Reply mock (should be called with the incomplete profile message)
    # Check the message sent by the decorator
    mock_update.effective_message.reply_text.assert_awaited_once_with(
        "Please complete your profile first by using the /profile command."
    )
    # Ensure the main handler's reply was NOT called
    mock_update.message.reply_text.assert_not_awaited()


# ==========================
# Match Callback Tests
# ==========================


@patch("src.bot.handlers.match.handle_like", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_match_callback_like(mock_handle_like: AsyncMock, mocker):
    """Test match_callback routes correctly to handle_like."""
    user_id = 123
    match_id = "match_abc"
    mock_update, mock_context = create_callback_mocks(user_id, f"like_{match_id}")

    # Mock middleware
    mocker.patch("src.bot.middleware.auth.get_user", return_value=mock_context.user_data["user"])
    mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    await match_callback(mock_update, mock_context)

    mock_update.callback_query.answer.assert_awaited_once()
    mock_handle_like.assert_awaited_once_with(mock_update, mock_context, match_id)


@patch("src.bot.handlers.match.handle_dislike", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_match_callback_dislike(mock_handle_dislike: AsyncMock, mocker):
    """Test match_callback routes correctly to handle_dislike."""
    user_id = 123
    match_id = "match_def"
    mock_update, mock_context = create_callback_mocks(user_id, f"dislike_{match_id}")

    # Mock middleware
    mocker.patch("src.bot.middleware.auth.get_user", return_value=mock_context.user_data["user"])
    mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    await match_callback(mock_update, mock_context)

    mock_update.callback_query.answer.assert_awaited_once()
    mock_handle_dislike.assert_awaited_once_with(mock_update, mock_context, match_id)


@patch("src.bot.handlers.match.match_command", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_match_callback_next(mock_match_command: AsyncMock, mocker):
    """Test match_callback routes correctly to match_command for 'next_match'."""
    user_id = 123
    mock_update, mock_context = create_callback_mocks(user_id, "next_match")

    # Mock middleware
    mocker.patch("src.bot.middleware.auth.get_user", return_value=mock_context.user_data["user"])
    mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    await match_callback(mock_update, mock_context)

    mock_update.callback_query.answer.assert_awaited_once()
    mock_update.callback_query.delete_message.assert_awaited_once()
    mock_match_command.assert_awaited_once_with(mock_update, mock_context)


@patch("src.bot.handlers.match.handle_like", new_callable=AsyncMock, side_effect=Exception("Test error"))
@pytest.mark.asyncio
async def test_match_callback_generic_error(mock_handle_like: AsyncMock, mocker):
    """Test match_callback generic error handling."""
    user_id = 123
    match_id = "match_err"
    mock_update, mock_context = create_callback_mocks(user_id, f"like_{match_id}")

    # Mock middleware
    mocker.patch("src.bot.middleware.auth.get_user", return_value=mock_context.user_data["user"])
    mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    await match_callback(mock_update, mock_context)

    mock_update.callback_query.answer.assert_awaited_once()
    mock_handle_like.assert_awaited_once()  # Ensure it was called
    mock_update.callback_query.edit_message_text.assert_awaited_once_with(
        "Sorry, something went wrong. Please try again with /match."
    )


# ==========================
# Handle Like/Dislike Tests
# ==========================


@patch("src.bot.handlers.match.get_match_by_id", new_callable=AsyncMock)
@patch("src.bot.handlers.match.get_user", new_callable=AsyncMock)
@patch("src.bot.handlers.match.like_match", new_callable=AsyncMock, return_value=False)  # One-sided like
@pytest.mark.asyncio
async def test_handle_like_one_sided(
    mock_like_match: AsyncMock,
    mock_get_user: AsyncMock,
    mock_get_match_by_id: AsyncMock,
    mocker,
):
    """Test handle_like for a one-sided like."""
    user_id = 123
    match_id = "match_like1"
    target_user_id = "456"
    mock_update, mock_context = create_callback_mocks(user_id, f"like_{match_id}")
    mock_env = mock_context.bot_data["env"]

    # Mock service return values
    mock_match = MagicMock(spec=MatchModel, target_user_id=target_user_id)
    mock_get_match_by_id.return_value = mock_match
    mock_target_user = MagicMock(spec=UserModel, first_name="LikedUser")
    mock_get_user.return_value = mock_target_user

    # Patch the internal handle_like function directly
    from src.bot.handlers.match import handle_like

    await handle_like(mock_update, mock_context, match_id)

    # Assertions
    mock_get_match_by_id.assert_awaited_once_with(mock_env, match_id)
    mock_get_user.assert_awaited_once_with(mock_env, target_user_id)
    mock_like_match.assert_awaited_once_with(mock_env, match_id)
    expected_text = MATCH_LIKED_MESSAGE.format(name="LikedUser")
    expected_keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match")]]
    )
    mock_update.callback_query.edit_message_text.assert_awaited_once_with(expected_text, reply_markup=expected_keyboard)


@patch("src.bot.handlers.match.get_match_by_id", new_callable=AsyncMock)
@patch("src.bot.handlers.match.get_user", new_callable=AsyncMock)
@patch("src.bot.handlers.match.like_match", new_callable=AsyncMock, return_value=True)  # Mutual like
@pytest.mark.asyncio
async def test_handle_like_mutual(
    mock_like_match: AsyncMock,
    mock_get_user: AsyncMock,
    mock_get_match_by_id: AsyncMock,
    mocker,
):
    """Test handle_like for a mutual match."""
    user_id = 123
    match_id = "match_like2"
    target_user_id = "789"
    mock_update, mock_context = create_callback_mocks(user_id, f"like_{match_id}")
    mock_env = mock_context.bot_data["env"]

    # Mock service return values
    mock_match = MagicMock(spec=MatchModel, target_user_id=target_user_id)
    mock_get_match_by_id.return_value = mock_match
    mock_target_user = MagicMock(spec=UserModel, first_name="MutualUser")
    mock_get_user.return_value = mock_target_user

    # Patch the internal handle_like function directly
    from src.bot.handlers.match import handle_like

    await handle_like(mock_update, mock_context, match_id)

    # Assertions
    mock_get_match_by_id.assert_awaited_once_with(mock_env, match_id)
    mock_get_user.assert_awaited_once_with(mock_env, target_user_id)
    mock_like_match.assert_awaited_once_with(mock_env, match_id)
    expected_text = MUTUAL_MATCH_MESSAGE.format(match_emoji="🎉", name="MutualUser", match_id=match_id)
    expected_keyboard = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("💬 Start Chat", callback_data=f"chat_{match_id}")],
            [InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match")],
        ]
    )
    mock_update.callback_query.edit_message_text.assert_awaited_once_with(expected_text, reply_markup=expected_keyboard)


@patch("src.bot.handlers.match.get_match_by_id", new_callable=AsyncMock, side_effect=NotFoundError("Match gone"))
@patch("src.bot.handlers.match.get_user", new_callable=AsyncMock)
@patch("src.bot.handlers.match.like_match", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_handle_like_not_found(
    mock_like_match: AsyncMock,
    mock_get_user: AsyncMock,
    mock_get_match_by_id: AsyncMock,
    mocker,
):
    """Test handle_like when the match is not found."""
    user_id = 123
    match_id = "match_gone"
    mock_update, mock_context = create_callback_mocks(user_id, f"like_{match_id}")
    mock_env = mock_context.bot_data["env"]

    # Patch the internal handle_like function directly
    from src.bot.handlers.match import handle_like

    await handle_like(mock_update, mock_context, match_id)

    # Assertions
    mock_get_match_by_id.assert_awaited_once_with(mock_env, match_id)
    mock_get_user.assert_not_awaited()  # Should fail before getting user
    mock_like_match.assert_not_awaited()
    mock_update.callback_query.edit_message_text.assert_awaited_once_with(
        "This match is no longer available. Try /match to find new matches."
    )


@patch("src.bot.handlers.match.get_match_by_id", new_callable=AsyncMock)
@patch("src.bot.handlers.match.get_user", new_callable=AsyncMock)
@patch("src.bot.handlers.match.dislike_match", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_handle_dislike_success(
    mock_dislike_match: AsyncMock,
    mock_get_user: AsyncMock,
    mock_get_match_by_id: AsyncMock,
    mocker,
):
    """Test handle_dislike successfully."""
    user_id = 123
    match_id = "match_dislike1"
    target_user_id = "101"
    mock_update, mock_context = create_callback_mocks(user_id, f"dislike_{match_id}")
    mock_env = mock_context.bot_data["env"]

    # Mock service return values
    mock_match = MagicMock(spec=MatchModel, target_user_id=target_user_id)
    mock_get_match_by_id.return_value = mock_match
    mock_target_user = MagicMock(spec=UserModel, first_name="PassedUser")
    mock_get_user.return_value = mock_target_user

    # Patch the internal handle_dislike function directly
    from src.bot.handlers.match import handle_dislike

    await handle_dislike(mock_update, mock_context, match_id)

    # Assertions
    mock_get_match_by_id.assert_awaited_once_with(mock_env, match_id)
    mock_get_user.assert_awaited_once_with(mock_env, target_user_id)
    mock_dislike_match.assert_awaited_once_with(mock_env, match_id)
    expected_text = MATCH_DISLIKED_MESSAGE.format(name="PassedUser")
    expected_keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match")]]
    )
    mock_update.callback_query.edit_message_text.assert_awaited_once_with(expected_text, reply_markup=expected_keyboard)


@patch("src.bot.handlers.match.get_match_by_id", new_callable=AsyncMock, side_effect=NotFoundError("Match gone"))
@patch("src.bot.handlers.match.get_user", new_callable=AsyncMock)
@patch("src.bot.handlers.match.dislike_match", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_handle_dislike_not_found(
    mock_dislike_match: AsyncMock,
    mock_get_user: AsyncMock,
    mock_get_match_by_id: AsyncMock,
    mocker,
):
    """Test handle_dislike when the match is not found."""
    user_id = 123
    match_id = "match_gone2"
    mock_update, mock_context = create_callback_mocks(user_id, f"dislike_{match_id}")
    mock_env = mock_context.bot_data["env"]

    # Patch the internal handle_dislike function directly
    from src.bot.handlers.match import handle_dislike

    await handle_dislike(mock_update, mock_context, match_id)

    # Assertions
    mock_get_match_by_id.assert_awaited_once_with(mock_env, match_id)
    mock_get_user.assert_not_awaited()
    mock_dislike_match.assert_not_awaited()
    mock_update.callback_query.edit_message_text.assert_awaited_once_with(
        "This match is no longer available. Try /match to find new matches."
    )


# ==========================
# Matches Command Tests
# ==========================


@patch("src.bot.handlers.match.get_active_matches", new_callable=AsyncMock)
@patch("src.bot.handlers.match.user_command_limiter")  # Patch the factory
@pytest.mark.asyncio
async def test_matches_command_no_active_matches(
    mock_limiter_factory: MagicMock,  # The factory mock
    mock_get_active_matches: AsyncMock,
    mocker,  # Use mocker fixture
):
    """Test /matches command when no active matches are found."""
    # --- Setup Mocks ---
    # Mock the limiter factory to return an AsyncMock instance
    mock_limiter_instance = AsyncMock()
    mock_limiter_factory.return_value = mock_limiter_instance

    # Mock middleware functions called by decorators
    mock_auth_get_user = mocker.patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock)
    mock_update_last_active = mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    # Mock user model returned by middleware's get_user
    mock_user_model = MagicMock(spec=UserModel)
    mock_user_model.is_profile_complete = True
    mock_auth_get_user.return_value = mock_user_model

    # Mock service call
    mock_get_active_matches.return_value = []

    # Mock Telegram objects
    mock_update = MagicMock(spec=Update)
    mock_update.effective_user = MagicMock(spec=User, id=12345)
    mock_update.message = MagicMock(spec=Message)
    mock_update.message.reply_text = AsyncMock()
    # Ensure effective_message.reply_text is also an AsyncMock for error handling in decorators
    mock_update.effective_message = MagicMock(spec=Message)
    mock_update.effective_message.reply_text = AsyncMock()

    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot_data = {"env": MagicMock()}
    mock_context.user_data = {"user": mock_user_model}

    # --- Execute Handler ---
    await matches_command(mock_update, mock_context)

    # --- Assertions ---
    # Middleware mocks
    assert mock_auth_get_user.await_count == 2  # @authenticated, @profile_required
    assert mock_update_last_active.await_count == 2
    mock_update_last_active.assert_awaited_with(mock_context.bot_data["env"], "12345")

    # Limiter mock
    mock_limiter_factory.assert_called_once()  # Factory called
    mock_limiter_instance.assert_awaited_once_with(mock_update, mock_context)  # Instance awaited

    # Service call mock
    mock_get_active_matches.assert_awaited_once_with(mock_context.bot_data["env"], "12345")

    # Reply mock
    expected_keyboard = ReplyKeyboardMarkup([["/match", "/profile"], ["/settings", "/help"]], resize_keyboard=True)
    mock_update.message.reply_text.assert_awaited_once_with(
        "You don't have any active matches yet. Use /match to start matching!",
        reply_markup=expected_keyboard,
    )


@patch("src.bot.handlers.match.get_active_matches", new_callable=AsyncMock)
@patch("src.bot.handlers.match.get_user", new_callable=AsyncMock)  # Mock get_user used within handler
@patch("src.bot.handlers.match.user_command_limiter")  # Patch the factory
@pytest.mark.asyncio
async def test_matches_command_with_active_matches(
    mock_limiter_factory: MagicMock,  # The factory mock
    mock_handler_get_user: AsyncMock,  # get_user called by handler
    mock_get_active_matches: AsyncMock,
    mocker,  # Use mocker fixture
):
    """Test /matches command when active matches are found."""
    # --- Setup Mocks ---
    user_id = "12345"
    match_user_id1 = "67890"
    match_user_id2 = "101112"
    match_id1 = "active_match1"
    match_id2 = "active_match2"

    # Mock the limiter factory to return an AsyncMock instance
    mock_limiter_instance = AsyncMock()
    mock_limiter_factory.return_value = mock_limiter_instance

    # Mock middleware functions called by decorators
    mock_auth_get_user = mocker.patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock)
    mock_update_last_active = mocker.patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)

    # Mock user model returned by middleware's get_user
    mock_user_model = MagicMock(spec=UserModel, id=user_id)
    mock_user_model.is_profile_complete = True
    mock_auth_get_user.return_value = mock_user_model

    # Mock service call - return two active matches
    mock_match1 = MagicMock(spec=MatchModel, id=match_id1, source_user_id=user_id, target_user_id=match_user_id1)
    mock_match2 = MagicMock(spec=MatchModel, id=match_id2, source_user_id=match_user_id2, target_user_id=user_id)
    mock_get_active_matches.return_value = [mock_match1, mock_match2]

    # Mock the user objects returned by the get_user call *within* matches_command
    mock_match_user1 = MagicMock(spec=UserModel, first_name="MatchOne", age=25)
    mock_match_user2 = MagicMock(spec=UserModel, first_name="MatchTwo", age=35)

    # Configure side_effect to return correct user based on ID
    def get_user_side_effect(env, requested_user_id):
        if requested_user_id == match_user_id1:
            return mock_match_user1
        elif requested_user_id == match_user_id2:
            return mock_match_user2
        else:
            raise NotFoundError("User not found in mock")

    mock_handler_get_user.side_effect = get_user_side_effect

    # Mock Telegram objects
    mock_update = MagicMock(spec=Update)
    mock_update.effective_user = MagicMock(spec=User, id=int(user_id))
    mock_update.message = MagicMock(spec=Message)
    mock_update.message.reply_text = AsyncMock()
    # Ensure effective_message.reply_text is also an AsyncMock for error handling in decorators
    mock_update.effective_message = MagicMock(spec=Message)
    mock_update.effective_message.reply_text = AsyncMock()

    mock_context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    mock_context.bot_data = {"env": MagicMock()}
    mock_context.user_data = {"user": mock_user_model}

    # --- Execute Handler ---
    await matches_command(mock_update, mock_context)

    # --- Assertions ---
    # Middleware mocks
    assert mock_auth_get_user.await_count == 2  # @authenticated, @profile_required
    assert mock_update_last_active.await_count == 2
    mock_update_last_active.assert_awaited_with(mock_context.bot_data["env"], user_id)

    # Limiter mock
    mock_limiter_factory.assert_called_once()  # Factory called
    mock_limiter_instance.assert_awaited_once_with(mock_update, mock_context)  # Instance awaited

    # Service call mock
    mock_get_active_matches.assert_awaited_once_with(mock_context.bot_data["env"], user_id)
    # Check get_user calls within the loop
    assert mock_handler_get_user.await_count == 2
    mock_handler_get_user.assert_any_await(mock_context.bot_data["env"], match_user_id1)
    mock_handler_get_user.assert_any_await(mock_context.bot_data["env"], match_user_id2)

    # Reply mock
    expected_message = "Your matches:\n\nMatchOne, 25\nMatchTwo, 35\n"
    expected_keyboard = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Chat with MatchOne", callback_data=f"chat_{match_id1}")],
            [InlineKeyboardButton("Chat with MatchTwo", callback_data=f"chat_{match_id2}")],
            [InlineKeyboardButton("Find new matches", callback_data="new_matches")],
        ]
    )
    mock_update.message.reply_text.assert_awaited_once_with(
        expected_message,
        reply_markup=expected_keyboard,
    )
