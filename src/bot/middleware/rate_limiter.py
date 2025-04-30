"""Rate limiting middleware for the MeetMatch bot."""

import functools
from typing import Any, Awaitable, Callable, Optional

from telegram import Update
from telegram.ext import ContextTypes

from ...config import Settings
from ...utils.errors import ConfigurationError, RateLimitError
from ...utils.logging import get_logger
from ...utils.rate_limiter import RateLimiter

logger = get_logger(__name__)


class RateLimiterMiddleware:
    """
    Middleware to apply rate limiting based on user ID using the new RateLimiter class.
    """

    def __init__(self, limit: int = 5, period: int = 60, scope: str = "default"):
        """
        Initialize the middleware.

        Args:
            limit: Maximum number of requests allowed in the period.
            period: The time period in seconds.
            scope: A string to differentiate rate limits (e.g., 'command', 'global').
        """
        self.limit = limit
        self.period = period
        self.scope = scope
        # RateLimiter instance is created dynamically in __call__
        # as it requires the 'env' object which is only available then.

    async def __call__(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        next_middleware: Callable[[Update, ContextTypes.DEFAULT_TYPE], Awaitable[Any]],
    ) -> Optional[Any]:
        """
        Process the update and apply rate limiting.

        Retrieves the 'env' object, creates a RateLimiter instance, checks the limit,
        and calls the next middleware if the limit is not exceeded.

        Args:
            update: The incoming Telegram update.
            context: The context object for the update.
            next_middleware: The next function/middleware in the chain.

        Returns:
            The result of the next middleware, or raises RateLimitError.

        Raises:
            ConfigurationError: If the 'env' object is not found in context.bot_data.
            RateLimitError: If the rate limit is exceeded.
        """
        # Ensure context contains Env object with KV binding
        if "env" not in context.bot_data:
            logger.error("Env object not found in context.bot_data for RateLimiterMiddleware")
            # Raise an error because rate limiting cannot function without env
            raise ConfigurationError("Rate limiter environment not configured.")

        env: Settings = context.bot_data["env"]

        # Ensure KV binding exists
        if not hasattr(env, "KV") or env.KV is None:
            logger.error("KV binding not found in env object for RateLimiterMiddleware")
            raise ConfigurationError("KV binding for rate limiter not configured.")

        user_id = str(update.effective_user.id)

        # Create RateLimiter instance dynamically with the retrieved env
        limiter = RateLimiter()

        try:
            # Check the rate limit using the new RateLimiter's method
            is_allowed, time_left = await limiter.check_rate_limit(env, user_id, self.scope)

            if not is_allowed:
                logger.warning(
                    "Rate limit exceeded",
                    user_id=user_id,
                    scope=self.scope,
                    limit=self.limit,
                    period=self.period,
                )
                raise RateLimitError("Rate limit exceeded.")

        except RateLimitError as e:
            # Log and re-raise the specific RateLimitError
            logger.warning(
                "Rate limit exceeded",
                user_id=user_id,
                scope=self.scope,
                limit=self.limit,
                period=self.period,
                error=str(e),
            )
            raise

        except Exception as e:
            # Log unexpected errors but allow the request to proceed
            # to avoid blocking the bot entirely due to limiter issues.
            logger.error(
                "Unexpected error in rate limiter check",
                user_id=user_id,
                scope=self.scope,
                error=str(e),
                exc_info=True,
            )
            # Allow request to proceed, but log the error.

        # Proceed to the next handler if the limit was not exceeded or an unexpected error occurred
        return await next_middleware(update, context)


def user_command_limiter(limit: int = 5, period: int = 60, scope: str = "command") -> Callable:
    """
    Decorator factory to apply rate limiting to command handlers.

    Args:
        limit: Maximum number of requests in the period.
        period: Time period in seconds.
        scope: The type of action being limited (maps to keys in RateLimiter.limits).

    Returns:
        A decorator function.
    """
    middleware = RateLimiterMiddleware(limit=limit, period=period, scope=scope)

    def decorator(func: Callable[[Update, ContextTypes.DEFAULT_TYPE], Awaitable[Any]]):
        """The actual decorator that takes the handler function."""

        @functools.wraps(func)  # Preserve original function metadata
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
            """The final wrapper that replaces the original handler."""

            # Define the 'next step' which is the original handler function
            async def _call_original_handler(u: Update, c: ContextTypes.DEFAULT_TYPE):
                return await func(u, c)

            # Call the middleware instance, passing the original handler as the next step
            # The middleware.__call__ will execute the rate limit logic
            # and if allowed, it will call _call_original_handler.
            await middleware(update, context, next_middleware=_call_original_handler)

        return wrapper  # Return the final wrapper

    return decorator  # Return the decorator function


# TODO: Review if global_user_limiter needs the same structural fix.
# It likely does if it's intended to be used as a decorator in the same way.
def global_user_limiter(limit: int = 30, period: int = 60) -> Callable:
    """
    Factory function to create a global rate limiter middleware instance for users.

    Args:
        limit: Maximum number of requests in the period.
        period: Time period in seconds.

    Returns:
        An awaitable function that acts as the rate limiter middleware.
    """
    middleware = RateLimiterMiddleware(limit=limit, period=period, scope="global")

    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Wrapper function to integrate middleware with handler structure."""

        async def _dummy_next(*args, **kwargs):
            pass

        await middleware(update, context, next_middleware=_dummy_next)

    return wrapper
