from .connection import get_supabase_client
from .schema import User
from uuid import UUID

def user_has_profile(user_id: UUID) -> bool:
    supabase = get_supabase_client()
    result = supabase.table('profiles').select('id').eq('user_id', str(user_id)).execute()
    return len(result.data) > 0

def get_user_gender(user_id: UUID) -> str:
    supabase = get_supabase_client()
    result = supabase.table('profiles').select('gender').eq('user_id', str(user_id)).execute()
    if result.data:
        return result.data[0]['gender']
    return None

def get_matched_user_info(user_id: UUID) -> User:
    supabase = get_supabase_client()
    result = supabase.table('users').select('*').eq('id', str(user_id)).execute()
    if result.data:
        return User(**result.data[0])
    return None