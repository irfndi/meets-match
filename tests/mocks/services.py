"""Mock services for testing."""

from unittest.mock import AsyncMock

# Mock user service functions
get_user = AsyncMock()
get_user_location = AsyncMock()
get_user_location_text = AsyncMock()
update_last_active = AsyncMock()
create_user = AsyncMock()
update_user = AsyncMock()
update_user_location = AsyncMock()
update_user_preferences = AsyncMock()
delete_user = AsyncMock()
get_users = AsyncMock()
wake_user = AsyncMock()
get_inactive_users = AsyncMock()
get_users_for_auto_sleep = AsyncMock()
set_user_sleeping = AsyncMock()

# Mock match service functions
# Constants
POTENTIAL_MATCHES_CACHE_KEY = "potential_matches:{user_id}"
USER_MATCHES_CACHE_KEY = "user_matches:{user_id}"
MATCH_CACHE_KEY = "match:{match_id}"

get_match = AsyncMock()
get_match_by_id = AsyncMock()
calculate_match_score = AsyncMock()
get_potential_matches = AsyncMock()
get_user_match_view = AsyncMock()
get_user_match_views = AsyncMock()
get_user_matches = AsyncMock()
get_active_matches = AsyncMock()
get_saved_matches = AsyncMock()
skip_match = AsyncMock()
get_pending_incoming_likes_count = AsyncMock()
create_match = AsyncMock()
update_match = AsyncMock()
like_match = AsyncMock()
dislike_match = AsyncMock()
delete_match = AsyncMock()
get_matches = AsyncMock()
