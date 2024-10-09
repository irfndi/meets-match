import os
import asyncio
from bot.config import supabase_client, MEDIA_CACHE_DIR
from loguru import logger

# Create a lock for the cleanup function
cleanup_lock = asyncio.Lock()

async def clean_up_unused_media():
    logger.info("Starting cleanup of unused media files.")
    
    # Fetch users with media
    response = await supabase_client.table("users").select("id, media, profile_completed").execute()
    users = response['data']  # Access the data correctly
    
    for user in users:
        if not user['profile_completed']:
            for media in user['media']:
                media_path = os.path.join(MEDIA_CACHE_DIR, media['url'].split('/')[-1])
                if os.path.exists(media_path):
                    os.remove(media_path)
                    logger.info(f"Removed unused media for user {user['id']}: {media_path}")

async def is_media_in_use(media_url: str) -> bool:
    """Check if the media is referenced in any active user profiles."""
    active_users = await supabase_client.table("users").select("media").execute()
    
    for user in active_users.data:
        if any(media['url'] == media_url for media in user.get('media', [])):
            return True
    return False

async def clean_up_empty_user_directories():
    """Remove user directories that do not contain any media files."""
    logger.info("Checking for empty user directories to clean up.")
    
    user_dirs = os.listdir(MEDIA_CACHE_DIR)
    for user_dir in user_dirs:
        user_path = os.path.join(MEDIA_CACHE_DIR, user_dir)
        if os.path.isdir(user_path) and not os.listdir(user_path):
            os.rmdir(user_path)
            logger.info(f"Removed empty directory: {user_path}")

# Call the cleanup function for empty directories
asyncio.run(clean_up_empty_user_directories())