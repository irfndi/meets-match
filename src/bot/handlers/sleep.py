"""Sleep/Pause handlers for the MeetMatch bot."""

from telegram import ReplyKeyboardRemove, Update
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated
from src.bot.ui.keyboards import main_menu
from src.services.user_service import get_user, set_user_sleeping, wake_user
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Sleep command messages
SLEEP_MESSAGE = """
💤 You are now paused.

You have logged out of the session, but your profile remains visible to others in the match cycle.

We will notify you here if someone likes your profile! 🔔

Type /start to wake up and resume.
"""

WAKE_UP_MESSAGE = """
👋 Welcome back!

You're now active again and visible to potential matches.

What would you like to do?
"""

ALREADY_SLEEPING_MESSAGE = """
💤 You're already in sleep mode.

Send any message or use /start when you're ready to come back!
"""


@authenticated
async def sleep_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the sleep/pause command or button.

    Args:
        update: The update object
        context: The context object
    """
    if not update.effective_user or not update.message:
        return

    user_id = str(update.effective_user.id)

    try:
        user = get_user(user_id)

        if user.is_sleeping:
            await update.message.reply_text(
                ALREADY_SLEEPING_MESSAGE,
                reply_markup=ReplyKeyboardRemove(),
            )
            return

        # Set user to sleeping
        set_user_sleeping(user_id, True)

        await update.message.reply_text(
            SLEEP_MESSAGE,
            reply_markup=ReplyKeyboardRemove(),
        )

        logger.info("User entered sleep mode", user_id=user_id)

    except Exception as e:
        logger.error(
            "Error in sleep command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")


async def wake_up_user(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Wake up a sleeping user if they are sleeping.

    This function is called by the authenticated middleware when a sleeping user
    sends any message.

    Args:
        update: The update object
        context: The context object

    Returns:
        True if user was woken up, False otherwise
    """
    if not update.effective_user:
        return False

    user_id = str(update.effective_user.id)

    try:
        user = get_user(user_id)

        if not user.is_sleeping:
            return False

        # Wake up the user
        wake_user(user_id)

        # Refresh user in context
        if context.user_data is not None:
            context.user_data["user"] = get_user(user_id)

        if update.effective_message:
            await update.effective_message.reply_text(
                WAKE_UP_MESSAGE,
                reply_markup=main_menu(),
            )

        logger.info("User woken up from sleep", user_id=user_id)
        return True

    except Exception as e:
        logger.error(
            "Error waking up user",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        return False
