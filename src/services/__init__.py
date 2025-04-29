"""Services package for the MeetMatch bot."""

from src.services.conversation_service import (
    create_conversation,
    create_message,
    get_conversation,
    get_conversation_by_match,
    get_unread_count,
    get_user_conversations,
    mark_messages_as_read,
    update_conversation_status,
)
from src.services.matching_service import (
    calculate_match_score,
    create_match,
    get_match,
    get_potential_matches,
    get_user_match_view,
    get_user_match_views,
    get_user_matches,
    update_match,
)
from src.services.user_service import (
    create_user,
    delete_user,
    get_user,
    get_user_location,
    update_last_active,
    update_user,
    update_user_location,
    update_user_preferences,
)

__all__ = [
    # User service
    "create_user",
    "delete_user",
    "get_user",
    "get_user_location",
    "update_last_active",
    "update_user",
    "update_user_location",
    "update_user_preferences",
    # Matching service
    "calculate_match_score",
    "create_match",
    "get_match",
    "get_potential_matches",
    "get_user_match_view",
    "get_user_match_views",
    "get_user_matches",
    "update_match",
    # Conversation service
    "create_conversation",
    "create_message",
    "get_conversation",
    "get_conversation_by_match",
    "get_unread_count",
    "get_user_conversations",
    "mark_messages_as_read",
    "update_conversation_status",
]
