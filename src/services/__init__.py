"""Services package for the MeetMatch bot."""

# flake8: noqa

# from src.services.conversation_service import (
#     create_conversation,
#     create_message,
#     get_conversation,
#     get_conversation_by_match,
#     get_unread_count,
#     get_user_conversations,
#     mark_messages_as_read,
#     update_conversation_status,
# )
from .matching_service import (
    get_potential_matches,
)
from .report_service import (
    get_banned_users,
    get_reports_by_reason,
    get_user_reports,
    report_user,
)
from .user_service import (
    create_user,
    delete_user,
    get_user,
    update_user,
    update_user_location,
    update_user_preferences,
)

__all__ = [
    # "create_conversation",
    # "create_message",
    # "get_conversation",
    # "get_conversation_by_match",
    # "get_unread_count",
    # "get_user_conversations",
    # "mark_messages_as_read",
    # "update_conversation_status",
    "get_potential_matches",
    "report_user",
    "get_user_reports",
    "get_reports_by_reason",
    "get_banned_users",
    "create_user",
    "delete_user",
    "get_user",
    "update_user",
    "update_user_location",
    "update_user_preferences",
]
