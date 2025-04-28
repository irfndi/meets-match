"""Rate limiting middleware for the MeetMatch bot."""

import time
from collections import defaultdict
from typing import Callable, Dict, Optional

from telegram import Update
from telegram.ext import ContextTypes

from src.utils.cache import get_cache, set_cache
from src.utils.errors import RateLimitError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# In-memory rate limiting (fallback if Redis is unavailable)
_rate_limits: Dict[str, Dict[str, float]] = defaultdict(dict)

# Cache keys
RATE_LIMIT_CACHE_KEY = "rate_limit:{key}"


async def rate_limiter(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    limit: int = 5,
    window: int = 60,
    key_func: Optional[Callable[[Update], str]] = None,
) -> None:
    """Rate limiting middleware for Telegram handlers.

    Args:
        update: Telegram update
        context: Telegram context
        limit: Maximum number of requests in the window
        window: Time window in seconds
        key_func: Function to generate rate limit key from update

    Raises:
        RateLimitError: If rate limit is exceeded
    """
    # Get user ID
    user_id = update.effective_user.id if update.effective_user else "anonymous"

    # Generate rate limit key
    if key_func:
        rate_key = key_func(update)
    else:
        # Default: limit by user ID and command/message type
        if update.message and update.message.text and update.message.text.startswith("/"):
            command = update.message.text.split()[0]
            rate_key = f"user:{user_id}:command:{command}"
        else:
            rate_key = f"user:{user_id}"

    # Check rate limit
    current_time = time.time()
    cache_key = RATE_LIMIT_CACHE_KEY.format(key=rate_key)

    try:
        # Try to use Redis cache
        cached_data = get_cache(cache_key)
        if cached_data:
            timestamps = [float(ts) for ts in cached_data.split(",")]
        else:
            timestamps = []

        # Filter timestamps within the window
        timestamps = [ts for ts in timestamps if current_time - ts < window]

        # Check if limit is exceeded
        if len(timestamps) >= limit:
            logger.warning(
                "Rate limit exceeded",
                user_id=user_id,
                rate_key=rate_key,
                limit=limit,
                window=window,
            )
            raise RateLimitError(
                f"Rate limit exceeded: {limit} requests per {window} seconds",
                details={"rate_key": rate_key, "limit": limit, "window": window},
            )

        # Add current timestamp
        timestamps.append(current_time)

        # Update cache
        set_cache(cache_key, ",".join(str(ts) for ts in timestamps), expiration=window)

    except Exception as e:
        if not isinstance(e, RateLimitError):
            logger.warning(
                "Failed to use Redis for rate limiting, falling back to in-memory",
                error=str(e),
            )

            # Fall back to in-memory rate limiting
            if rate_key in _rate_limits:
                timestamps = [ts for ts in _rate_limits[rate_key].values() if current_time - ts < window]

                # Check if limit is exceeded
                if len(timestamps) >= limit:
                    logger.warning(
                        "Rate limit exceeded (in-memory)",
                        user_id=user_id,
                        rate_key=rate_key,
                        limit=limit,
                        window=window,
                    )
                    raise RateLimitError(
                        f"Rate limit exceeded: {limit} requests per {window} seconds",
                        details={"rate_key": rate_key, "limit": limit, "window": window},
                    ) from None
            else:
                _rate_limits[rate_key] = {}

            # Add current timestamp
            request_id = str(int(current_time * 1000))  # Millisecond precision
            _rate_limits[rate_key][request_id] = current_time

            # Clean up old timestamps
            _rate_limits[rate_key] = {
                rid: ts for rid, ts in _rate_limits[rate_key].items() if current_time - ts < window
            }

            # Re-raise if it was a rate limit error
            if isinstance(e, RateLimitError):
                raise


def user_command_limiter(limit: int = 5, window: int = 60) -> Callable:
    """Create a rate limiter for user commands.

    Args:
        limit: Maximum number of requests in the window
        window: Time window in seconds

    Returns:
        Rate limiter function
    """

    async def limiter(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Rate limit by user ID and command."""
        await rate_limiter(
            update,
            context,
            limit=limit,
            window=window,
            key_func=lambda u: (
                f"user:{u.effective_user.id if u.effective_user else 'anonymous'}:"
                f"command:{u.message.text.split()[0] if u.message and u.message.text else 'message'}"
            ),
        )

    return limiter


def global_user_limiter(limit: int = 30, window: int = 60) -> Callable:
    """Create a global rate limiter for users.

    Args:
        limit: Maximum number of requests in the window
        window: Time window in seconds

    Returns:
        Rate limiter function
    """

    async def limiter(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Rate limit by user ID globally."""
        await rate_limiter(
            update,
            context,
            limit=limit,
            window=window,
            key_func=lambda u: f"user:{u.effective_user.id if u.effective_user else 'anonymous'}:global",
        )

    return limiter
