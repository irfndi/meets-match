"""Start command handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.

from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.middleware import user_command_limiter
from src.models.user import User
from src.services.user_service import create_user, get_user, update_user
from src.utils.errors import NotFoundError
from src.utils.logging import get_logger
from src.bot.ui.keyboards import main_menu, registration_menu

logger = get_logger(__name__)

# Welcome message template
WELCOME_MESSAGE = """
👋 Welcome to MeetMatch!

I'm your personal matchmaking assistant. I'll help you find people with similar interests near you.

To get started:
1️⃣ Set up your profile with /profile
2️⃣ Start matching with /match
3️⃣ View your matches with /matches

Need help? Just type /help anytime.
"""

# Registration message template
REGISTRATION_MESSAGE = """
Great! Let's set up your profile. Please tell me:

1️⃣ Your name (use /name Your Name)
2️⃣ Your age (use /age 25, allowed range 10-65)
3️⃣ Your gender (use /gender Male/Female)
4️⃣ A brief bio (use /bio Your bio here)
5️⃣ Your interests (use /interests comma,separated,list)
6️⃣ Your location (use /location or share your location)

You can update any of these later using the same commands.
"""


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /start command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)
    username = update.effective_user.username
    first_name = update.effective_user.first_name

    try:
        # Check if user already exists
        user = get_user(user_id)
        logger.info("Existing user started the bot", user_id=user_id)

        # Update user data if needed
        if (username and username != user.username) or (first_name and first_name != user.first_name):
            update_user(
                user_id,
                {
                    "username": username or user.username,
                    "first_name": first_name or user.first_name,
                    "last_active": "now()",
                },
            )

        # Send welcome message with main menu
        await update.message.reply_text(
            f"Welcome back, {user.first_name or 'there'}! {WELCOME_MESSAGE}",
            reply_markup=main_menu(),
        )

    except NotFoundError:
        # Create new user
        logger.info("New user registration", user_id=user_id, username=username)

        user_data = User(
            id=user_id,
            username=username,
            first_name=first_name or "User",
            last_name=update.effective_user.last_name,
            is_active=True,
        )

        create_user(user_data)

        # Send welcome and registration messages
        await update.message.reply_text(WELCOME_MESSAGE)
        await update.message.reply_text(
            REGISTRATION_MESSAGE,
            reply_markup=registration_menu(),
        )

    except Exception as e:
        logger.error(
            "Error in start command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")
