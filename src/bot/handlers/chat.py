"""Chat handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service, conversation_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.

from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, profile_required, user_command_limiter
from src.services.matching_service import get_match_by_id
from src.services.user_service import get_user
from src.utils.errors import (
    NotFoundError,
)
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Chat command messages
CHAT_START_MESSAGE = """
💬 Chat with {name}

Type your message below or use /matches to go back to your matches.
"""

NO_MESSAGES_YET = """
No messages yet. Start the conversation by saying hello!
"""

CHAT_NOT_FOUND_MESSAGE = """
Chat not found. This match may no longer be active.

Use /matches to see your active matches.
"""


@authenticated
@profile_required
async def chat_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /chat command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    message_text = update.message.text.strip()

    # Check if command includes the match ID
    if message_text == "/chat":
        await update.message.reply_text("Please use /chat with a match ID or use /matches to see your matches.")
        return

    # Extract match ID from command
    match_id = message_text[5:].strip()

    env = context.bot_data["env"]  # Retrieve env
    await open_chat(update, context, match_id, env)


@authenticated
@profile_required
async def chat_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle chat-related callbacks.

    Args:
        update: The update object
        context: The context object
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]  # Retrieve env

    try:
        await query.answer()
        callback_data = query.data

        if callback_data.startswith("chat_"):
            # Extract match ID
            match_id = callback_data[5:]

            # Delete the callback message
            await query.delete_message()

            # Open chat
            await open_chat(update, context, match_id, env)

        elif callback_data == "back_to_matches":
            # Go back to matches
            await query.delete_message()
            await context.bot.send_message(
                chat_id=user_id,
                text="Returning to matches...",
                reply_markup=ReplyKeyboardMarkup(
                    [["/matches", "/match"], ["/profile", "/help"]],
                    resize_keyboard=True,
                ),
            )

    except Exception as e:
        logger.error(
            "Error in chat callback",
            user_id=user_id,
            callback_data=query.data,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /matches.")


async def open_chat(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str, env: str) -> None:
    """Open a chat with a match.

    Args:
        update: The update object
        context: The context object
        match_id: Match ID
        env: Environment
    """
    user_id = str(update.effective_user.id)

    try:
        # Get match details
        match = await get_match_by_id(env, match_id)

        # Verify user is part of this match
        if user_id not in [match.source_user_id, match.target_user_id]:
            logger.warning(
                "User tried to access chat they're not part of",
                user_id=user_id,
                match_id=match_id,
            )
            await send_message_to_user(update, context, "You don't have permission to access this chat.")
            return

        # Get the other user
        other_user_id = match.target_user_id if match.source_user_id == user_id else match.source_user_id
        other_user = await get_user(env, other_user_id)

        # Store chat context
        context.user_data["current_chat"] = {
            "match_id": match_id,
            "other_user_id": other_user_id,
            "other_user_name": other_user.first_name,
        }

        # Send chat header
        await send_message_to_user(
            update,
            context,
            CHAT_START_MESSAGE.format(name=other_user.first_name),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/matches", "/match"],
                    ["/profile", "/help"],
                ],
                resize_keyboard=True,
            ),
        )

        await send_message_to_user(update, context, NO_MESSAGES_YET)

    except NotFoundError:
        logger.warning(
            "Match or conversation not found",
            user_id=user_id,
            match_id=match_id,
        )
        await send_message_to_user(update, context, CHAT_NOT_FOUND_MESSAGE)

    except Exception as e:
        logger.error(
            "Error opening chat",
            user_id=user_id,
            match_id=match_id,
            error=str(e),
            exc_info=e,
        )
        await send_message_to_user(update, context, "Sorry, something went wrong. Please try again later.")


@profile_required
async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle chat messages.

    Args:
        update: The update object
        context: The context object
    """
    # Check if user is in a chat
    chat_context = context.user_data.get("current_chat")
    if not chat_context:
        return

    logger.warning("message_handler: Conversation logic temporarily disabled.")
    await update.message.reply_text("(Chat message sending is temporarily disabled)")


async def send_message_to_user(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str, **kwargs) -> None:
    """Send a message to the user.

    Args:
        update: The update object
        context: The context object
        text: Message text
        **kwargs: Additional arguments for send_message
    """
    if update.callback_query:
        await context.bot.send_message(
            chat_id=update.effective_user.id,
            text=text,
            **kwargs,
        )
    else:
        await update.message.reply_text(text, **kwargs)
