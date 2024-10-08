from .connection import get_supabase_client
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

def add_like(user_id: UUID, liked_user_id: UUID) -> bool:
    supabase = get_supabase_client()
    try:
        result = supabase.table('likes').insert({
            "user_id": str(user_id),
            "liked_user_id": str(liked_user_id)
        }).execute()
        if result.error:
            raise Exception(f"Error adding like: {result.error}")
        return True
    except Exception as e:
        logger.error(f"Error in add_like: {str(e)}")
        return False

def get_likes_for_user(user_id: UUID) -> list:
    supabase = get_supabase_client()
    try:
        result = supabase.table('likes').select('liked_user_id').eq('user_id', str(user_id)).execute()
        if result.error:
            raise Exception(f"Error fetching likes: {result.error}")
        return [UUID(like['liked_user_id']) for like in result.data]
    except Exception as e:
        logger.error(f"Error in get_likes_for_user: {str(e)}")
        return []
