from .connection import get_supabase_client
import logging

logger = logging.getLogger(__name__)

async def update_user_preferences(user_id: int, preferences: dict):
    supabase = get_supabase_client()
    try:
        result = supabase.table('user_preferences').upsert({
            'user_id': str(user_id),
            **preferences
        }).execute()
        if result.error:
            raise Exception(f"Error updating user preferences: {result.error}")
        logger.info(f"Updated preferences for user {user_id}")
    except Exception as e:
        logger.error(f"Error updating user preferences: {e}")
        raise