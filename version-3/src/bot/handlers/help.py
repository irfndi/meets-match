"""Help handlers for the MeetMatch bot."""

from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.middleware import user_command_limiter
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Help messages
HELP_MESSAGE = """
🤖 *MeetMatch Bot Help*

*Basic Commands:*
/start - Start the bot and register
/help - Show this help message
/profile - View and edit your profile
/match - Find new matches
/matches - View your current matches
/settings - Adjust your preferences

*Profile Commands:*
/name - Set your name
/age - Set your age
/gender - Set your gender
/bio - Set your bio
/interests - Set your interests
/location - Set your location

*Chat Commands:*
/chat [match_id] - Chat with a match

Need more help? Contact support at @MeetMatchSupport
"""

ABOUT_MESSAGE = """
*About MeetMatch*

MeetMatch is an AI-powered matchmaking bot that helps you find people with similar interests near you.

*How it works:*
1. Create your profile
2. Set your preferences
3. Get matched with compatible people
4. Chat and connect

*Privacy:*
- Your data is secure and never shared with third parties
- You control what information is visible to others
- You can delete your account at any time with /delete

*Version:* 3.0
*Created by:* MeetMatch Team
"""


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /help command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    await update.message.reply_text(
        HELP_MESSAGE,
        parse_mode="Markdown",
        reply_markup=ReplyKeyboardMarkup(
            [
                ["/profile", "/match"],
                ["/matches", "/settings"],
                ["/about", "/start"],
            ],
            resize_keyboard=True,
        ),
    )


async def about_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /about command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

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
