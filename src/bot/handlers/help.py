"""Help command handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service, conversation_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.

from telegram import ReplyKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, user_command_limiter
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Help messages
HELP_MESSAGE = """
/start - Start interacting with the bot
/profile - View and manage your profile
/preferences - Set your matching preferences
/match - Find new matches
/matches - View your current matches
/settings - Adjust your preferences
/about - Learn more about MeetMatch
"""

ABOUT_MESSAGE = """MeetMatch helps you find meaningful connections based on compatibility.

Version: 0.1.0
Developed with ❤️ in Silicon Valley.
"""


@authenticated
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /help is issued."""
    user_id = str(update.effective_user.id)

    # Apply rate limiting explicitly
    is_limited, remaining_time = await user_command_limiter(limit=5, period=60)(update, context)
    if is_limited:
        logger.info("Rate limit exceeded for /help command", user_id=user_id)
        await update.message.reply_text(f"You're sending commands too quickly! Please wait {remaining_time:.1f}s.")
        return

    logger.info("/help command invoked", user_id=user_id)
    await update.message.reply_text(
        HELP_MESSAGE,
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=ReplyKeyboardMarkup(
            [
                ["/profile", "/match"],
                ["/matches", "/settings"],
                ["/about", "/start"],
            ],
            resize_keyboard=True,
        ),
    )


@authenticated
async def about_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /about command.

    Args:
        update: The update object
        context: The context object
    """
    user_id = str(update.effective_user.id)

    # Apply rate limiting explicitly
    is_limited, remaining_time = await user_command_limiter(limit=3, period=120)(update, context)
    if is_limited:
        logger.info("Rate limit exceeded for /about command", user_id=user_id)
        await update.message.reply_text(f"You're sending commands too quickly! Please wait {remaining_time:.1f}s.")
        return

    logger.info("/about command invoked", user_id=user_id)
    await update.message.reply_text(
        ABOUT_MESSAGE,
        parse_mode="Markdown",
        reply_markup=ReplyKeyboardMarkup(
            [
                ["/profile", "/match"],
                ["/matches", "/settings"],
                ["/help", "/start"],
            ],
            resize_keyboard=True,
        ),
    )
