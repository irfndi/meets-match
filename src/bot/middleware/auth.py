"""Authentication middleware for the MeetMatch bot."""

import asyncio
from functools import wraps
from typing import Any, Callable, List, Optional, TypeVar, cast

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.ui.keyboards import setup_profile_prompt_keyboard
from src.services.matching_service import POTENTIAL_MATCHES_CACHE_KEY, get_potential_matches
from src.services.user_service import get_user, update_last_active
from src.utils.cache import get_cache
from src.utils.errors import NotFoundError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Type variable for handler functions
HandlerType = TypeVar("HandlerType", bound=Callable[..., Any])


async def warm_up_matches(user_id: str) -> None:
    """Background task to warm up match cache."""
    try:
        # Run blocking DB call in a separate thread to avoid blocking the event loop
        await asyncio.to_thread(get_potential_matches, user_id)
        logger.debug("Match cache warmed up in background", user_id=user_id)
    except Exception as e:
        logger.warning("Failed to warm up match cache", user_id=user_id, error=str(e))


def authenticated(func: HandlerType) -> HandlerType:
    """Decorator to ensure user is authenticated.

    Args:
        func: Handler function to decorate

    Returns:
        Decorated handler function
    """

    @wraps(func)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args: Any, **kwargs: Any) -> Any:
        """Check if user is authenticated before executing handler."""
        if not update.effective_user:
            logger.warning("No user found in update")
            if update.effective_message:
                await update.effective_message.reply_text("Authentication failed. Please try again.")
            return

        user_id = str(update.effective_user.id)

        try:
            # Try to get user from database
            # Run blocking DB call in a separate thread
            user = await asyncio.to_thread(get_user, user_id)

            # Update last active timestamp
            # Run blocking DB call in a separate thread
            await asyncio.to_thread(update_last_active, user_id)

            # Cache Warm-up: Check if matches are cached, if not, trigger background generation
            # This ensures when user clicks /matches, data is likely ready
            # Also extend TTL if it exists, since user is active
            cache_key = POTENTIAL_MATCHES_CACHE_KEY.format(user_id=user_id)
            if not get_cache(cache_key, extend_ttl=3600):
                # Check if task is already running to avoid duplicates/spam
                if context.user_data is not None:
                    existing_task = context.user_data.get("warmup_task")
                    if not existing_task or existing_task.done():
                        # Fire and forget background task
                        # Store reference in context to prevent garbage collection
                        task = asyncio.create_task(warm_up_matches(user_id))
                        context.user_data["warmup_task"] = task

            # Store user in context
            if context.user_data is not None:
                context.user_data["user"] = user

            missing_region = not (
                getattr(user, "preferences", None) and getattr(user.preferences, "preferred_country", None)
            )
            missing_language = not (
                getattr(user, "preferences", None) and getattr(user.preferences, "preferred_language", None)
            )
            is_callback = getattr(update, "callback_query", None) is not None
            command = update.message.text.split()[0] if update.message and update.message.text else ""
            allowed = ["/start", "/settings"]

            if (missing_region or missing_language) and not is_callback and command not in allowed:
                msg = "Please complete your setup before continuing:"
                buttons = []
                if missing_region:
                    msg += "\n• Region is not set"
                    buttons.append([InlineKeyboardButton("🌍 Set Region", callback_data="settings_region")])
                if missing_language:
                    msg += "\n• Language is not set"
                    buttons.append([InlineKeyboardButton("🗣 Set Language", callback_data="settings_language")])

                if update.effective_message:
                    await update.effective_message.reply_text(
                        msg,
                        reply_markup=InlineKeyboardMarkup(buttons),
                    )
                return

            return await func(update, context, *args, **kwargs)

        except NotFoundError:
            # User not found, might need registration
            logger.info("User not found, needs registration", user_id=user_id)

            # Check if we're already in the registration handler
            command = update.message.text.split()[0] if update.message and update.message.text else ""
            if command in ["/start", "/register"]:
                # Allow registration handlers to proceed
                return await func(update, context, *args, **kwargs)

            # Redirect to registration
            if update.effective_message:
                await update.effective_message.reply_text("Please register first by using the /start command.")
            return

        except Exception as e:
            logger.error(
                "Authentication error",
                user_id=user_id,
                error=str(e),
                exc_info=e,
            )
            if update.effective_message:
                await update.effective_message.reply_text(
                    "An error occurred during authentication. Please try again later."
                )
            return

    return cast(HandlerType, wrapper)


def admin_only(admin_ids: Optional[List[str]] = None) -> Callable[[HandlerType], HandlerType]:
    """Decorator to ensure user is an admin.

    Args:
        admin_ids: List of admin user IDs

    Returns:
        Decorator function
    """

    def decorator(func: HandlerType) -> HandlerType:
        """Decorator to ensure user is an admin.

        Args:
            func: Handler function to decorate

        Returns:
            Decorated handler function
        """

        @wraps(func)
        @authenticated
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args: Any, **kwargs: Any) -> Any:
            """Check if user is an admin before executing handler."""
            if not update.effective_user:
                return

            user_id = str(update.effective_user.id)

            # Check if user is in admin list
            if admin_ids and user_id not in admin_ids:
                logger.warning("Non-admin user attempted admin action", user_id=user_id)
                if update.effective_message:
                    await update.effective_message.reply_text("You don't have permission to perform this action.")
                return

            # Execute handler
            return await func(update, context, *args, **kwargs)

        return cast(HandlerType, wrapper)

    return decorator


def profile_required(func: HandlerType) -> HandlerType:
    """Decorator to ensure user has completed required profile fields.

    Required fields: name, age
    Recommended (optional) fields: gender, bio, interests, location

    Args:
        func: Handler function to decorate

    Returns:
        Decorated handler function
    """
    from src.services.user_service import update_user

    @wraps(func)
    @authenticated
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args: Any, **kwargs: Any) -> Any:
        """Check if user has completed required profile fields before executing handler."""
        user = None
        if context.user_data is not None:
            user = context.user_data.get("user")

        if not user:
            if update.effective_message:
                await update.effective_message.reply_text("Please register first by using the /start command.")
            return

        missing_required = []
        if not user.first_name:
            missing_required.append("Name")
        if not user.age:
            missing_required.append("Age")

        if missing_required:
            if not update.effective_user:
                return

            logger.info(
                "User profile incomplete - missing required fields",
                user_id=str(update.effective_user.id),
                missing=missing_required,
            )

            missing_text = ", ".join(missing_required)

            if update.effective_message:
                await update.effective_message.reply_text(
                    f"You need to complete your profile before matching.\n\n"
                    f"Missing required fields: {missing_text}\n\n"
                    f"Click 'Setup Profile' to complete your profile now!",
                    reply_markup=setup_profile_prompt_keyboard(),
                )
            return

        if not user.is_profile_complete:
            if update.effective_user:
                update_user(str(update.effective_user.id), {"is_profile_complete": True})
                user = get_user(str(update.effective_user.id))
                if context.user_data is not None:
                    context.user_data["user"] = user

        # Execute handler
        return await func(update, context, *args, **kwargs)

    return cast(HandlerType, wrapper)
