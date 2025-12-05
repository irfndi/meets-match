"""Mock services for testing."""

from unittest.mock import MagicMock

# Mock user service functions
get_user = MagicMock()
get_user_location = MagicMock()
get_user_location_text = MagicMock()
update_last_active = MagicMock()
create_user = MagicMock()
update_user = MagicMock()
update_user_location = MagicMock()
update_user_preferences = MagicMock()
delete_user = MagicMock()
get_users = MagicMock()
wake_user = MagicMock()
get_inactive_users = MagicMock()
get_users_for_auto_sleep = MagicMock()
set_user_sleeping = MagicMock()

# Mock match service functions
# Constants
POTENTIAL_MATCHES_CACHE_KEY = "potential_matches:{user_id}"
USER_MATCHES_CACHE_KEY = "user_matches:{user_id}"
MATCH_CACHE_KEY = "match:{match_id}"

get_match = MagicMock()
get_match_by_id = MagicMock()
calculate_match_score = MagicMock()
get_potential_matches = MagicMock()
get_user_match_view = MagicMock()
get_user_match_views = MagicMock()
get_user_matches = MagicMock()
get_active_matches = MagicMock()
get_saved_matches = MagicMock()
skip_match = MagicMock()
get_pending_incoming_likes_count = MagicMock()
create_match = MagicMock()
update_match = MagicMock()
like_match = MagicMock()
dislike_match = MagicMock()
delete_match = MagicMock()
get_matches = MagicMock()
