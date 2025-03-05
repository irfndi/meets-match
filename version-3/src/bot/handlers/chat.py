"""Chat handlers for the MeetMatch bot."""

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, profile_required, user_command_limiter
from src.models.conversation import MessageStatus
from src.services.conversation_service import (
    create_message,
    get_conversation_by_match,
    get_messages,
    mark_messages_as_read,
)
from src.services.matching_service import get_match_by_id
from src.services.user_service import get_user
from src.utils.errors import NotFoundError
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

    await open_chat(update, context, match_id)


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

    try:
        await query.answer()
        callback_data = query.data

        if callback_data.startswith("chat_"):
            # Extract match ID
            match_id = callback_data[5:]

            # Delete the callback message
            await query.delete_message()

            # Open chat
            await open_chat(update, context, match_id)

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


async def open_chat(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str) -> None:
    """Open a chat with a match.

    Args:
        update: The update object
        context: The context object
        match_id: Match ID
    """
    user_id = str(update.effective_user.id)

    try:
        # Get match details
        match = get_match_by_id(match_id)

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
        other_user = get_user(other_user_id)

        # Get or create conversation
        conversation = get_conversation_by_match(match_id)

        # Store chat context
        context.user_data["current_chat"] = {
            "match_id": match_id,
            "conversation_id": conversation.id,
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

        # Get messages
        messages = get_messages(conversation.id)

        if not messages:
            await send_message_to_user(update, context, NO_MESSAGES_YET)
            return

        # Display messages
        for message in messages:
            sender_name = "You" if message.sender_id == user_id else other_user.first_name

            await send_message_to_user(
                update,
                context,
                f"{sender_name}: {message.content}",
            )

        # Mark messages as read
        mark_messages_as_read(conversation.id, user_id)

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


@authenticated
@profile_required
async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle chat messages.

    Args:
        update: The update object
        context: The context object
    """
    user_id = str(update.effective_user.id)
    message_text = update.message.text

    # Check if user is in a chat
    chat_context = context.user_data.get("current_chat")
    if not chat_context:
        return

    try:
        # Create message
        create_message(
            conversation_id=chat_context["conversation_id"],
            sender_id=user_id,
            content=message_text,
            status=MessageStatus.SENT,
        )

        # Send message to other user
        await context.bot.send_message(
            chat_id=chat_context["other_user_id"],
            text=f"💬 {chat_context['other_user_name']}: {message_text}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("Reply", callback_data=f"chat_{chat_context['match_id']}")]]
            ),
        )

    except Exception as e:
        logger.error(
            "Error sending message",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, your message couldn't be sent. Please try again.")


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
