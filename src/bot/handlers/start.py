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

        # STRATEGY CHANGE: Default to English if language is missing.
        # Do NOT block on missing region/language. Let profile setup handle it.
        if not prefs or not getattr(prefs, "preferred_language", None):
            from src.models.user import Preferences
            from src.services.user_service import update_user_preferences

            # Create new prefs or use existing
            new_prefs = prefs or Preferences()
            new_prefs.preferred_language = "en"

            # Update user
            update_user_preferences(user_id, new_prefs)
            logger.info("Set default language to 'en' for user", user_id=user_id)

        # Check for missing profile fields (casual prompt)
        # This handles both required fields (always prompted) and recommended fields (prompted if cooldown passed)
        # We do this BEFORE matching to ensure profile quality, but respect the cooldown for skipped fields.
        from src.bot.handlers.profile import prompt_for_next_missing_field

        # If we're missing region, it will be handled when user sets location in profile
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

        # STRATEGY CHANGE: Set default language to EN and start profile setup directly
        from src.models.user import Preferences
        from src.services.user_service import update_user_preferences

        # Set default preferences
        prefs = Preferences(preferred_language="en", max_distance=20)
        update_user_preferences(user_id, prefs)

        await update.message.reply_text("👋 Welcome to MeetMatch! Let's set up your profile.")

        # Import here to avoid circular dependency
        from src.bot.handlers.profile import prompt_for_next_missing_field

        await prompt_for_next_missing_field(update, context, user_id)

    except Exception as e:
        logger.error(
            "Error in start command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")
