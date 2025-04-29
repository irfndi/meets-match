# Migrated RateLimiter from src/meetsmatch/validators.py
# TODO: Cloudflare Evaluation
# This is a simple in-memory rate limiter. Evaluate if Cloudflare's built-in
# rate limiting features (configurable in the dashboard or via API) are sufficient.
# If more complex logic or state persistence across worker instances is needed,
# consider implementing rate limiting using Cloudflare KV for storage.

from datetime import datetime, timedelta
from typing import Optional, Tuple


class RateLimiter:
    def __init__(self):
        # TODO: Consider making these configurable via src/config.py
        self.limits = {
            "message": {"count": 30, "window": 60},  # 30 messages per minute
            "media_upload": {"count": 5, "window": 60},  # 5 media uploads per minute
            "match_request": {"count": 20, "window": 60},  # 20 match requests per minute
            "report_user": {"count": 5, "window": 3600},  # 5 reports per hour
            "profile_update": {"count": 10, "window": 3600}, # 10 profile updates per hour
        }
        # This dictionary will grow indefinitely in memory - not suitable for production workers
        # Needs persistent storage (like KV) if kept.
        self.user_actions = {}

    async def check_rate_limit(
        self, user_id: int, action_type: str
    ) -> Tuple[bool, Optional[int]]:
        """
        Check if action is within rate limits.
        WARNING: In-memory implementation, not suitable for production Cloudflare Workers.

        Args:
            user_id: User ID
            action_type: Type of action (keys from self.limits)

        Returns:
            Tuple[bool, Optional[int]]: (is_allowed, seconds_until_reset)
        """
        if action_type not in self.limits:
            # Allow unknown actions by default, or raise an error
            print(f"Warning: Unknown action type '{action_type}' for rate limiting.")
            return True, None

        now = datetime.utcnow()
        key = f"{user_id}:{action_type}"

        if key not in self.user_actions:
            self.user_actions[key] = []

        limit_info = self.limits[action_type]
        window = timedelta(seconds=limit_info["window"])

        # Clean old actions (inefficient for large lists)
        self.user_actions[key] = [ts for ts in self.user_actions[key] if now - ts < window]

        # Check limit
        if len(self.user_actions[key]) >= limit_info["count"]:
            oldest_action_time = min(self.user_actions[key])
            reset_time = oldest_action_time + window
            seconds_left = max(0, int((reset_time - now).total_seconds()))
            return False, seconds_left

        # Add new action timestamp
        self.user_actions[key].append(now)
        return True, None


# Global instance - TODO: Consider dependency injection or a KV-based implementation
rate_limiter = RateLimiter()
