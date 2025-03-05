"""Authentication middleware for the MeetMatch bot."""

from functools import wraps
from typing import Any, Callable, List, Optional, TypeVar, cast

from telegram import Update
from telegram.ext import ContextTypes

from src.services.user_service import get_user, update_last_active
from src.utils.errors import AuthenticationError, NotFoundError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Type variable for handler functions
HandlerType = TypeVar("HandlerType", bound=Callable[..., Any])


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
            await update.effective_message.reply_text(
                "Authentication failed. Please try again."
            )
            return
        
        user_id = str(update.effective_user.id)
        
        try:
            # Try to get user from database
            user = get_user(user_id)
            
            # Update last active timestamp
            update_last_active(user_id)
            
            # Store user in context
            context.user_data["user"] = user
            
            # Execute handler
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
            await update.effective_message.reply_text(
                "Please register first by using the /start command."
            )
            return
        
        except Exception as e:
            logger.error(
                "Authentication error",
                user_id=user_id,
                error=str(e),
                exc_info=e,
            )
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
            user_id = str(update.effective_user.id)
            
            # Check if user is in admin list
            if admin_ids and user_id not in admin_ids:
                logger.warning("Non-admin user attempted admin action", user_id=user_id)
                await update.effective_message.reply_text(
                    "You don't have permission to perform this action."
                )
                return
            
            # Execute handler
            return await func(update, context, *args, **kwargs)
        
        return cast(HandlerType, wrapper)
    
    return decorator


def profile_required(func: HandlerType) -> HandlerType:
    """Decorator to ensure user has a complete profile.

    Args:
        func: Handler function to decorate

    Returns:
        Decorated handler function
    """
    @wraps(func)
    @authenticated
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args: Any, **kwargs: Any) -> Any:
        """Check if user has a complete profile before executing handler."""
        user = context.user_data.get("user")
        
        if not user or not user.is_profile_complete:
            logger.info(
                "User profile incomplete",
                user_id=str(update.effective_user.id),
            )
            await update.effective_message.reply_text(
                "Please complete your profile first by using the /profile command."
            )
            return
        
        # Execute handler
        return await func(update, context, *args, **kwargs)
    
    return wrapper
