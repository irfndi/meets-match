"""Mock services for testing."""

from unittest.mock import AsyncMock

# Mock user service functions
get_user = AsyncMock()
update_last_active = AsyncMock()
create_user = AsyncMock()
update_user = AsyncMock()
delete_user = AsyncMock()
get_users = AsyncMock()

# Mock conversation service functions
get_conversation = AsyncMock()
create_conversation = AsyncMock()
update_conversation = AsyncMock()
delete_conversation = AsyncMock()
get_conversations = AsyncMock()
get_messages = AsyncMock()
create_message = AsyncMock()

# Mock match service functions
get_match = AsyncMock()
create_match = AsyncMock()
update_match = AsyncMock()
delete_match = AsyncMock()
get_matches = AsyncMock()

# Mock profile service functions
get_profile = AsyncMock()
create_profile = AsyncMock()
update_profile = AsyncMock()
delete_profile = AsyncMock()
get_profiles = AsyncMock()
