"""Match handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service, matching_service, conversation_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, profile_required, user_command_limiter
from src.services.action_service import (
    dislike_match,
    like_match,
)
from src.services.matching_service import (
    get_active_matches,
    get_match_by_id,
    get_potential_matches,
)
from src.services.user_service import get_user
from src.utils.errors import ConfigurationError, NotFoundError, RateLimitError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Match command messages
NO_MATCHES_MESSAGE = """
No potential matches found at the moment.

Try again later or adjust your matching preferences with /settings.
"""

MATCH_PROFILE_TEMPLATE = """
{emoji} {name}, {age}
{gender_emoji} {gender}

{bio}

{interests_emoji} Interests: {interests}

{location_emoji} {location}

Do you like this match?
"""

MATCH_LIKED_MESSAGE = """
You liked {name}!

If they like you back, you'll be able to start a conversation.
"""

MATCH_DISLIKED_MESSAGE = """
You passed on {name}.

Let's find someone else for you.
"""

MUTUAL_MATCH_MESSAGE = """
{match_emoji} It's a match!

You and {name} liked each other. Start a conversation with /chat {match_id}.
"""


@authenticated
@profile_required
async def match_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /match command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]

    try:
        # Get potential matches
        potential_matches = await get_potential_matches(env, user_id)

        if not potential_matches:
            await update.message.reply_text(
                NO_MATCHES_MESSAGE,
                reply_markup=ReplyKeyboardMarkup(
                    [
                        ["/profile", "/settings"],
                        ["/matches", "/help"],
                    ],
                    resize_keyboard=True,
                ),
            )
            return

        # Get the first potential match
        match = potential_matches[0]
        match_user = await get_user(env, match.target_user_id)

        # Format interests
        interests_text = ", ".join(match_user.interests) if match_user.interests else "None"

        # Format location
        location_text = (
            f"{match_user.location_city}, {match_user.location_country}"
            if match_user.location_city
            else "Unknown location"
        )

        # Send match profile
        await update.message.reply_text(
            MATCH_PROFILE_TEMPLATE.format(
                emoji="👤",
                name=match_user.first_name,
                age=match_user.age,
                gender_emoji="⚧",
                gender=match_user.gender.value if match_user.gender else "Not specified",
                bio=match_user.bio or "No bio provided",
                interests_emoji="📝",
                interests=interests_text,
                location_emoji="📍",
                location=location_text,
            ),
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("👍 Like", callback_data=f"like_{match.id}"),
                        InlineKeyboardButton("👎 Pass", callback_data=f"dislike_{match.id}"),
                    ],
                    [
                        InlineKeyboardButton("⏭️ Next", callback_data="next_match"),
                    ],
                ]
            ),
        )

    except RateLimitError as e:
        logger.warning("Rate limit hit on /match", user_id=user_id, error=str(e))
        await update.message.reply_text(str(e))
    except ConfigurationError as e:
        logger.error("Configuration error during /match", user_id=user_id, error=str(e), exc_info=True)
        await update.message.reply_text("A configuration error occurred. Please contact support.")
    except Exception as e:
        logger.error(
            "Error in match command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")


@authenticated
@profile_required
async def match_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle match-related callbacks.

    Args:
        update: The update object
        context: The context object
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        await query.answer()
        callback_data = query.data

        if callback_data.startswith("like_"):
            # Handle like action
            match_id = callback_data[5:]
            await handle_like(update, context, match_id)

        elif callback_data.startswith("dislike_"):
            # Handle dislike action
            match_id = callback_data[8:]
            await handle_dislike(update, context, match_id)

        elif callback_data == "next_match":
            # Show next match
            await query.delete_message()
            await match_command(update, context)

    except Exception as e:
        logger.error(
            "Error in match callback",
            user_id=user_id,
            callback_data=query.data,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /match.")


async def handle_like(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str) -> None:
    """Handle liking a match.

    Args:
        update: The update object
        context: The context object
        match_id: Match ID
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]

    try:
        # Get match details
        match = await get_match_by_id(env, match_id)
        target_user = await get_user(env, match.target_user_id)

        # Like the match
        is_mutual = await like_match(env, match_id)

        if is_mutual:
            # Mutual match
            await query.edit_message_text(
                MUTUAL_MATCH_MESSAGE.format(
                    match_emoji="🎉",
                    name=target_user.first_name,
                    match_id=match_id,
                ),
                reply_markup=InlineKeyboardMarkup(
                    [
                        [
                            InlineKeyboardButton("💬 Start Chat", callback_data=f"chat_{match_id}"),
                        ],
                        [
                            InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match"),
                        ],
                    ]
                ),
            )
        else:
            # One-sided like
            await query.edit_message_text(
                MATCH_LIKED_MESSAGE.format(name=target_user.first_name),
                reply_markup=InlineKeyboardMarkup(
                    [
                        [
                            InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match"),
                        ],
                    ]
                ),
            )

    except NotFoundError:
        logger.warning(
            "Match not found in like handler",
            user_id=user_id,
            match_id=match_id,
        )
        await query.edit_message_text("This match is no longer available. Try /match to find new matches.")

    except Exception as e:
        logger.error(
            "Error in like handler",
            user_id=user_id,
            match_id=match_id,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /match.")


async def handle_dislike(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str) -> None:
    """Handle disliking a match.

    Args:
        update: The update object
        context: The context object
        match_id: Match ID
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]

    try:
        # Get match details
        match = await get_match_by_id(env, match_id)
        target_user = await get_user(env, match.target_user_id)

        # Dislike the match
        await dislike_match(env, match_id)

        await query.edit_message_text(
            MATCH_DISLIKED_MESSAGE.format(name=target_user.first_name),
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match"),
                    ],
                ]
            ),
        )

    except NotFoundError:
        logger.warning(
            "Match not found in dislike handler",
            user_id=user_id,
            match_id=match_id,
        )
        await query.edit_message_text("This match is no longer available. Try /match to find new matches.")

    except Exception as e:
        logger.error(
            "Error in dislike handler",
            user_id=user_id,
            match_id=match_id,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /match.")


@authenticated
@profile_required
async def matches_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /matches command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]

    try:
        # Get active matches
        active_matches = await get_active_matches(env, user_id)

        if not active_matches:
            await update.message.reply_text(
                "You don't have any active matches yet. Use /match to start matching!",
                reply_markup=ReplyKeyboardMarkup(
                    [
                        ["/match", "/profile"],
                        ["/settings", "/help"],
                    ],
                    resize_keyboard=True,
                ),
            )
            return

        # Create message with matches list
        message = "Your matches:\n\n"
        keyboard = []

        for match in active_matches:
            # Get match user details
            match_user_id = match.target_user_id if match.source_user_id == user_id else match.source_user_id
            match_user = await get_user(env, match_user_id)

            # Add to message
            message += f"{match_user.first_name}, {match_user.age}\n"

            # Add chat button
            keyboard.append(
                [
                    InlineKeyboardButton(
                        f"Chat with {match_user.first_name}",
                        callback_data=f"chat_{match.id}",
                    )
                ]
            )

        # Add navigation buttons
        keyboard.append([InlineKeyboardButton("Find new matches", callback_data="new_matches")])

        await update.message.reply_text(
            message,
            reply_markup=InlineKeyboardMarkup(keyboard),
        )

    except Exception as e:
        logger.error(
            "Error in matches command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")
