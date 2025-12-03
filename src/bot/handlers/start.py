"""Start command handlers for the MeetMatch bot."""

from telegram import Update
from telegram.ext import ContextTypes

from src.bot.middleware import user_command_limiter
from src.bot.ui.keyboards import main_menu
from src.models.user import User
from src.services.user_service import create_user, get_user, update_user
from src.utils.errors import NotFoundError
from src.utils.logging import get_logger

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


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /start command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.effective_user or not update.message:
        return

    user_id = str(update.effective_user.id)
    username = update.effective_user.username
    first_name = update.effective_user.first_name

    try:
        # Check if user already exists
        user = get_user(user_id)
        logger.info("Existing user started the bot", user_id=user_id)

        # Update user data if needed
        if (username and username != user.username) or (first_name and first_name != user.first_name):
            from typing import Any, Dict

            update_data: Dict[str, Any] = {
                "username": username or user.username or "",
                "first_name": first_name or user.first_name or "",
                "last_active": "now()",
            }
            update_user(user_id, update_data)

        # Check for missing region or language
        prefs = getattr(user, "preferences", None)
        logger.info(
            "Checking user preferences in start_command",
            user_id=user_id,
            preferences=prefs.model_dump() if prefs else None,
        )

        missing_region = not (prefs and getattr(prefs, "preferred_country", None))
        missing_language = not (prefs and getattr(prefs, "preferred_language", None))

        if missing_region or missing_language:
            await update.message.reply_text("👋 Welcome back! Please set your region and language to continue.")
            # Import here to avoid circular dependency
            from src.bot.handlers.settings import settings_command

            await settings_command(update, context)
            return

        # Check for missing profile fields (casual prompt)
        # This handles both required fields (always prompted) and recommended fields (prompted if cooldown passed)
        # We do this BEFORE matching to ensure profile quality, but respect the cooldown for skipped fields.
        from src.bot.handlers.profile import prompt_for_next_missing_field

        has_missing = await prompt_for_next_missing_field(update, context, user_id, silent_if_complete=True)
        if has_missing:
            return

        # Check if user is eligible for matching
        if user.is_match_eligible():
            from src.bot.handlers.match import get_and_show_match

            match_shown = await get_and_show_match(update, context, user_id)
            if match_shown:
                return

            # If no matches, show main menu with specific message
            await update.message.reply_text(
                "Wait until someone sees you... 🕰️",
                reply_markup=main_menu(),
            )
            return

        # If not eligible, show main menu
        # Note: We already attempted to prompt for missing fields above.
        # If we are here, it means the user is ineligible AND we are in cooldown (or user explicitly skipped).

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

        # For new users, force region/language setup immediately
        await update.message.reply_text("👋 Welcome to MeetMatch! To get started, please set your region and language.")

        # Import here to avoid circular dependency
        from src.bot.handlers.settings import settings_command

        await settings_command(update, context)

    except Exception as e:
        logger.error(
            "Error in start command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")
