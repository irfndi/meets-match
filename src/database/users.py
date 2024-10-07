from .connection import supabase
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

async def user_has_profile(user_id: str) -> bool:
    try:
        response = await supabase.table('users').select('id').eq('id', user_id).limit(1).execute()
        return len(response.data) > 0
    except Exception as e:
        logger.error(f"Error checking user profile: {e}")
        return False

async def get_user_gender(user_id: str) -> Optional[str]:
    try:
        response = await supabase.table('users').select('gender').eq('id', user_id).limit(1).execute()
        return response.data[0]['gender'] if response.data else None
    except Exception as e:
        logger.error(f"Error getting user gender: {e}")
        return None

async def get_matched_user_info(user_id: str) -> Optional[Dict]:
    try:
        result = await supabase.table('matches') \
            .select('matched_user_id, users!inner(id, first_name, last_name, username, photo_url)') \
            .eq('user_id', user_id) \
            .limit(1) \
            .execute()
        
        if result.data:
            matched_user = result.data[0]['users']
            return {
                'id': matched_user['id'],
                'first_name': matched_user['first_name'],
                'last_name': matched_user['last_name'],
                'username': matched_user['username'],
                'photo_url': matched_user['photo_url']
            }
        return None
    except Exception as e:
        logger.error(f"Error getting matched user info: {e}")
        return None