# Migrated RateLimiter from src/meetsmatch/validators.py
# Refactored to use Cloudflare KV for persistence across worker instances.

import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from ..config import Settings

# Key prefix for KV storage
RATE_LIMIT_KV_PREFIX = "rate_limit"


class RateLimiter:
    def __init__(self):
        # Limits configuration (could be moved to Settings if needed)
        self.limits = {
            "message": {"count": 30, "window": 60},  # 30 messages per minute
            "media_upload": {"count": 5, "window": 60},  # 5 media uploads per minute
            "match_request": {"count": 20, "window": 60},  # 20 match requests per minute
            "report_user": {"count": 5, "window": 3600},  # 5 reports per hour
            "profile_update": {"count": 10, "window": 3600},  # 10 profile updates per hour
        }

    async def check_rate_limit(self, env: Settings, user_id: int, action_type: str) -> Tuple[bool, Optional[int]]:
        """
        Check if action is within rate limits using Cloudflare KV.

        Args:
            env: Cloudflare environment object with bindings.
            user_id: User ID
            action_type: Type of action (keys from self.limits)

        Returns:
            Tuple[bool, Optional[int]]: (is_allowed, seconds_until_reset)
        """
        if action_type not in self.limits:
            # Allow unknown actions by default, log a warning
            # Consider raising an error for stricter control
            print(f"Warning: Unknown action type '{action_type}' for rate limiting.")
            return True, None

        limit_info = self.limits[action_type]
        window_seconds = limit_info["window"]
        limit_count = limit_info["count"]

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(seconds=window_seconds)

        # Construct KV key
        key = f"{RATE_LIMIT_KV_PREFIX}:{user_id}:{action_type}"

        # Get current timestamps from KV
        timestamps_iso: List[str] = []
        try:
            cached_data = await env.KV.get(key, type="json")
            if cached_data and isinstance(cached_data, list):
                timestamps_iso = cached_data
        except Exception as e:
            # Log error but proceed as if no prior actions (fail open)
            print(f"Error reading rate limit KV key '{key}': {e}")

        # Filter timestamps within the current window
        # Convert ISO strings back to datetime objects for comparison
        recent_timestamps = []
        for ts_iso in timestamps_iso:
            try:
                ts = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
                if ts >= window_start:
                    recent_timestamps.append(ts)
            except ValueError:
                print(f"Warning: Skipping invalid timestamp format in KV key '{key}': {ts_iso}")
                continue  # Skip invalid entries

        # Check limit
        if len(recent_timestamps) >= limit_count:
            oldest_action_time = min(recent_timestamps)  # Oldest timestamp *within the window*
            reset_time = oldest_action_time + timedelta(seconds=window_seconds)
            seconds_left = max(0, int((reset_time - now).total_seconds()))
            print(f"Rate limit exceeded for {key}. Reset in {seconds_left}s")
            return False, seconds_left

        # Add new action timestamp (as ISO string) and update KV
        updated_timestamps_iso = [ts.isoformat() for ts in recent_timestamps] + [now.isoformat()]

        try:
            # Store updated list back to KV, expiring slightly after the window ends
            await env.KV.put(key, json.dumps(updated_timestamps_iso), expiration_ttl=window_seconds + 60)
        except Exception as e:
            # Log error but allow the action (fail open)
            print(f"Error writing rate limit KV key '{key}': {e}")

        return True, None
