from .connection import get_supabase_client
from .schema import Profile, User
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

async def create_profile(user_id: UUID, age: int, gender: str, interests: dict, photo_url: str = None) -> Profile:
    supabase = get_supabase_client()
    profile_data = {
        "user_id": str(user_id),
        "age": age,
        "gender": gender,
        "interests": interests,
        "photo_url": photo_url
    }
    result = await supabase.table('profiles').insert(profile_data).execute()
    if result.error:
        raise Exception(f"Error creating profile: {result.error}")
    return Profile(**result.data[0])

async def get_profile(user_id: UUID) -> Profile:
    supabase = get_supabase_client()
    result = await supabase.table('profiles').select('*').eq('user_id', str(user_id)).execute()
    if result.error:
        raise Exception(f"Error fetching profile: {result.error}")
    if not result.data:
        return None
    return Profile(**result.data[0])

async def update_profile(profile: Profile) -> Profile:
    supabase = get_supabase_client()
    result = await supabase.table('profiles').update(profile.__dict__).eq('id', str(profile.id)).execute()
    if result.error:
        raise Exception(f"Error updating profile: {result.error}")
    return Profile(**result.data[0])

async def create_user(username: str, first_name: str, last_name: str, bio: str) -> User:
    supabase = get_supabase_client()
    user_data = {
        "username": username,
        "first_name": first_name,
        "last_name": last_name,
        "bio": bio
    }
    result = await supabase.table('users').insert(user_data).execute()
    if result.error:
        raise Exception(f"Error creating user: {result.error}")
    return User(**result.data[0])

async def get_user(user_id: UUID) -> User:
    supabase = get_supabase_client()
    result = await supabase.table('users').select('*').eq('id', str(user_id)).execute()
    if result.error:
        raise Exception(f"Error fetching user: {result.error}")
    if not result.data:
        return None
    return User(**result.data[0])
