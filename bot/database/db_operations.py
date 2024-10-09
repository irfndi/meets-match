from bot.config import supabase_client, MEDIA_CACHE_DIR, db_logger
from supabase import create_client, Client
from postgrest import APIError
from storage3.utils import StorageException
from .schema import User, Preference, Match, Report
import json
from uuid import UUID
from datetime import datetime
from dataclasses import fields
from .migrations import run_migrations, check_all_schemas
import traceback
import os
import aiohttp
import asyncio
try:
    import aiofiles
except ImportError:
    aiofiles = None
    print("Warning: aiofiles module not found. Some file operations may not work as expected.")
from typing import Any
from dotenv import load_dotenv
from loguru import logger

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Supabase URL and Key must be set in environment variables.")

# Initialize Supabase client
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Example usage of db_logger
db_logger.info("Starting database operations")

# Configure logger for database operations
db_logger.add(
    "database.log",
    rotation="500 MB",
    retention="10 days",
    level="INFO",
    format="{time:YYYY-MM-DD at HH:mm:ss} | {level} | {message}"
)

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return json.JSONEncoder.default(self, obj)

async def setup_database(supabase):
    try:
        db_logger.info("Starting database setup")
        if not verify_database_connection(supabase):
            db_logger.error("Failed to verify database connection")
            return False
        db_logger.info("Database connection verified successfully")

        ensure_media_cache_dir()
        db_logger.info("Media cache directory ensured")

        migrations_success = await run_migrations()
        if not migrations_success:
            db_logger.warning("Migration process encountered issues. Attempting to continue with existing schema.")

        await check_all_schemas()
        db_logger.info("Schema check completed")

        from .migrations import ensure_media_column
        await ensure_media_column()
        db_logger.info("Media column ensured")

        db_logger.info("Database setup completed successfully")
        return True
    except Exception as e:
        db_logger.error(f"Error during database setup: {str(e)}")
        db_logger.error(f"Traceback: {traceback.format_exc()}")
        return False

def verify_database_connection(supabase):
    try:
        response = supabase.table('users').select('id').limit(1).execute()
        db_logger.info("Database connection verified")
        return True
    except Exception as e:
        db_logger.error(f"Failed to verify database connection: {str(e)}")
        return False

async def create_users_table():
    query = """
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username TEXT UNIQUE NOT NULL,
        age INTEGER,
        gender TEXT,
        interests TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """
    await execute_sql(query)

async def create_preferences_table():
    query = """
    CREATE TABLE IF NOT EXISTS preferences (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        age_min INTEGER,
        age_max INTEGER,
        gender_preference TEXT,
        interests TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """
    await execute_sql(query)

async def create_matches_table():
    query = """
    CREATE TABLE IF NOT EXISTS matches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user1_id UUID REFERENCES users(id),
        user2_id UUID REFERENCES users(id),
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """
    await execute_sql(query)

async def create_reports_table():
    query = """
    CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reporter_id UUID REFERENCES users(id),
        reported_id UUID REFERENCES users(id),
        reason TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """
    await execute_sql(query)

async def setup_rls_policies():
    try:
        # Enable RLS on all tables
        tables = ['users', 'preferences', 'matches', 'reports']
        for table in tables:
            supabase_client.rpc("execute_sql", {"query": f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"}).execute()

        # Set up policies for each table
        await setup_users_policies()
        await setup_preferences_policies()
        await setup_matches_policies()
        await setup_reports_policies()
    except Exception as e:
        db_logger.error(f"Error setting up RLS policies: {str(e)}")
        raise

async def setup_users_policies():
    policies = [
        ("users_select_own", "SELECT", "auth.uid() = id OR auth.role() = 'service_role'", "Users can view their own data, service role can view all"),
        ("users_insert_own", "INSERT", "auth.role() = 'service_role'", "Only service role can insert data"),
        ("users_update_own", "UPDATE", "auth.uid() = id OR auth.role() = 'service_role'", "Users can update their own data, service role can update all"),
        ("users_delete_own", "DELETE", "auth.role() = 'service_role'", "Only service role can delete data"),
    ]
    for name, operation, using, comment in policies:
        query = f"""
        CREATE POLICY {name} ON users
        FOR {operation}
        {'USING' if operation != 'INSERT' else 'WITH CHECK'} ({using});
        COMMENT ON POLICY {name} ON users IS '{comment}';
        """
        supabase_client.rpc("execute_sql", {"query": query}).execute()

async def setup_preferences_policies():
    policies = [
        ("preferences_select_own", "SELECT", "auth.uid() = user_id", "Users can view their own preferences"),
        ("preferences_insert_own", "INSERT", "auth.uid() = user_id", "Users can insert their own preferences"),
        ("preferences_update_own", "UPDATE", "auth.uid() = user_id", "Users can update their own preferences"),
        ("preferences_delete_own", "DELETE", "auth.uid() = user_id", "Users can delete their own preferences"),
    ]
    for name, operation, using, comment in policies:
        query = f"""
        CREATE POLICY {name} ON preferences
        FOR {operation}
        {'USING' if operation != 'INSERT' else 'WITH CHECK'} ({using});
        COMMENT ON POLICY {name} ON preferences IS '{comment}';
        """
        supabase_client.rpc("execute_sql", {"query": query}).execute()

async def setup_matches_policies():
    policies = [
        ("matches_select_own", "SELECT", "auth.uid() = user1_id OR auth.uid() = user2_id", "Users can view their own matches"),
        ("matches_insert_own", "INSERT", "auth.uid() = user1_id OR auth.uid() = user2_id", "Users can insert their own matches"),
        ("matches_update_own", "UPDATE", "auth.uid() = user1_id OR auth.uid() = user2_id", "Users can update their own matches"),
        ("matches_delete_own", "DELETE", "auth.uid() = user1_id OR auth.uid() = user2_id", "Users can delete their own matches"),
    ]
    for name, operation, using, comment in policies:
        query = f"""
        CREATE POLICY {name} ON matches
        FOR {operation}
        {'USING' if operation != 'INSERT' else 'WITH CHECK'} ({using});
        COMMENT ON POLICY {name} ON matches IS '{comment}';
        """
        supabase_client.rpc("execute_sql", {"query": query}).execute()

async def setup_reports_policies():
    policies = [
        ("reports_select_own", "SELECT", "auth.uid() = reporter_id", "Users can view their own reports"),
        ("reports_insert_own", "INSERT", "auth.uid() = reporter_id", "Users can insert their own reports"),
        ("reports_update_own", "UPDATE", "auth.uid() = reporter_id", "Users can update their own reports"),
        ("reports_delete_own", "DELETE", "auth.uid() = reporter_id", "Users can delete their own reports"),
    ]
    for name, operation, using, comment in policies:
        query = f"""
        CREATE POLICY {name} ON reports
        FOR {operation}
        {'USING' if operation != 'INSERT' else 'WITH CHECK'} ({using});
        COMMENT ON POLICY {name} ON reports IS '{comment}';
        """
        supabase_client.rpc("execute_sql", {"query": query}).execute()

async def update_rls_policies():
    # Drop all existing policies
    tables = ['users', 'preferences', 'matches', 'reports']
    for table in tables:
        query = f"DROP POLICY IF EXISTS ON {table}"
        supabase_client.rpc("execute_sql", {"query": query}).execute()

    # Set up new policies
    await setup_rls_policies()

async def create_user(user_data: dict):
    try:
        db_logger.info(f"Creating user with data: {user_data}")
        result = await supabase_client.table('users').insert(user_data).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        db_logger.error(f"Error creating user: {str(e)}")
        raise

async def create_bucket_if_not_exists(bucket_name: str = "user-media"):
    admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    bucket_exists = admin_supabase.storage.get_bucket(bucket_name)

    if not bucket_exists:
        admin_supabase.storage.create_bucket(bucket_name)
        db_logger.info(f"Bucket '{bucket_name}' created successfully.")
    else:
        db_logger.info(f"Bucket '{bucket_name}' already exists.")

async def upload_file_to_bucket(file, file_name: str, bucket_name: str = "user-media"):
    try:
        await create_bucket_if_not_exists(bucket_name)
        
        file_content = await file.download_as_bytearray()
        
        response = await supabase_client.storage.from_(bucket_name).upload(file_name, file_content)
        
        if not response:
            raise Exception("No response received from Supabase storage upload")
        
        public_url = supabase_client.storage.from_(bucket_name).get_public_url(file_name)
        if not public_url:
            raise Exception("Failed to get public URL for uploaded file")
        
        return public_url
    except Exception as e:
        logger.error(f"Error uploading file to bucket: {str(e)}")
        raise

async def download_file_from_telegram(file_id: str, bot):
    try:
        file = await bot.get_file(file_id)
        file_path = f"temp_{file_id}"
        await file.download_to_drive(file_path)
        return file_path
    except Exception as e:
        db_logger.error(f"Error downloading file from Telegram: {str(e)}")
        raise

async def update_user(user: User) -> bool:
    try:
        user_dict = {k: v for k, v in user.__dict__.items() if v is not None}
        
        if isinstance(user_dict.get('media'), list):
            user_dict['media'] = json.dumps(user_dict['media'])
        
        db_fields = ['id', 'username', 'age', 'gender', 'looking_for', 'city', 'name', 'bio', 'media', 'language', 'last_profile_check', 'profile_completed', 'created_at', 'updated_at', 'interests']
        filtered_user_dict = {k: v for k, v in user_dict.items() if k in db_fields}
        
        json_data = json.dumps(filtered_user_dict, cls=CustomJSONEncoder)
        
        admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        response = admin_supabase.table("users").update(json.loads(json_data)).eq("username", user.username).execute()

        if response.data:
            db_logger.info(f"User {user.username} updated successfully")
            return True
        else:
            db_logger.error(f"No data returned when updating user {user.username}")
            return False

    except Exception as e:
        db_logger.error(f"Error updating user: {str(e)}")
        db_logger.error(f"Traceback: {traceback.format_exc()}")
        return False

async def verify_media_url(media_url: str) -> bool:
    """Check if the media URL is valid and accessible."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(media_url) as response:
                return response.status == 200
    except Exception as e:
        logger.error(f"Error verifying media URL {media_url}: {str(e)}")
        return False

async def clean_up_unused_media():
    logger.info("Starting cleanup of unused media files.")
    
    users = await supabase_client.table("users").select("id, media").execute()
    
    for user in users.data:
        user_id = user['id']
        media_files = user.get('media', [])
        
        for media in media_files:
            media_url = media['url']
            file_name = media_url.split('/')[-1]
            local_file_path = os.path.join(MEDIA_CACHE_DIR, user_id, file_name)
            
            if not await is_media_in_use(media_url):
                if os.path.exists(local_file_path):
                    os.remove(local_file_path)
                    logger.info(f"Deleted unused media file: {local_file_path}")
                else:
                    logger.warning(f"Media file not found locally: {local_file_path}")

    logger.info("Cleanup of unused media files completed.")

async def is_media_in_use(media_url: str) -> bool:
    """Check if the media is referenced in any active user profiles."""
    active_users = await supabase_client.table("users").select("media").execute()
    
    for user in active_users.data:
        if any(media['url'] == media_url for media in user.get('media', [])):
            return True
    return False

async def cache_media(user: User):
    for media_item in user.media:
        url = media_item['url']
        file_name = url.split('/')[-1]
        cache_path = os.path.join(MEDIA_CACHE_DIR, user.username, file_name)
        
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        async with aiofiles.open(cache_path, 'wb') as f:
                            await f.write(await response.read())
            logger.info(f"Cached media for user {user.username}: {file_name}")
        except Exception as e:
            logger.error(f"Failed to cache media for user {user.username}: {str(e)}")

async def get_cached_media_url(user: User, original_url: str) -> str:
    file_name = original_url.split('/')[-1]
    cache_path = os.path.join(MEDIA_CACHE_DIR, user.username, file_name)
    if os.path.exists(cache_path):
        return f"file://{cache_path}"
    return original_url

async def verify_and_update_media(user: User) -> User:
    updated_media = []
    for media_item in user.media:
        if await verify_media_url(media_item['url']):
            updated_media.append(media_item)
        else:
            cached_url = await get_cached_media_url(user, media_item['url'])
            if cached_url.startswith("file://"):
                updated_media.append({**media_item, 'url': cached_url, 'is_cached': True})
            else:
                logger.warning(f"Media not available for user {user.username}: {media_item['url']}")
    
    user.media = updated_media
    return user

async def get_or_create_user(user_data):
    try:
        user = await get_user(user_data['id'])
        if not user:
            user = await create_user(user_data)
        return user
    except Exception as e:
        db_logger.error(f"Error in get_or_create_user: {str(e)}")
        raise

def is_profile_complete(user: User) -> bool:
    required_fields = ['age', 'gender', 'looking_for', 'city', 'name', 'bio']
    has_required_fields = all(getattr(user, field) is not None for field in required_fields)
    has_media = len(user.media) > 0
    is_complete = has_required_fields and has_media
    logger.info(f"Profile completeness check for {user.username}: {is_complete}")
    return is_complete

async def recreate_users_table():
    drop_query = """
    DROP TABLE IF EXISTS reports CASCADE;
    DROP TABLE IF EXISTS preferences CASCADE;
    DROP TABLE IF EXISTS matches CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    """
    supabase_client.rpc("execute_sql", {"query": drop_query}).execute()
    await create_users_table()
    await create_preferences_table()
    await create_matches_table()
    await create_reports_table()
    db_logger.info("Users table and related tables recreated successfully")

# Implement similar functions for preferences, matches, and reports as needed

# Add this function to periodically check and update media
async def periodic_media_check():
    db_logger.info("Starting periodic media check")
    admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    users = admin_supabase.table("users").select("*").execute()
    
    for user_data in users.data:
        user = User(**user_data)
        updated_user = await verify_and_update_media(user)
        if updated_user.media != user.media:
            await update_user(updated_user)
            db_logger.info(f"Updated media for user {user.username}")
    
    db_logger.info("Periodic media check completed")

def ensure_media_cache_dir():
    if not os.path.exists(MEDIA_CACHE_DIR):
        os.makedirs(MEDIA_CACHE_DIR)
        db_logger.info(f"Created media cache directory: {MEDIA_CACHE_DIR}")
    else:
        db_logger.info(f"Media cache directory already exists: {MEDIA_CACHE_DIR}")

# Error tracking
error_count = 0

def log_error(error_message: str):
    global error_count
    error_count += 1
    db_logger.error(f"Error {error_count}: {error_message}")

# Performance tracking
from time import time

def measure_execution_time(func):
    async def wrapper(*args, **kwargs):
        start_time = time()
        result = await func(*args, **kwargs)
        end_time = time()
        execution_time = end_time - start_time
        db_logger.info(f"Function {func.__name__} took {execution_time:.4f} seconds to execute")
        return result
    return wrapper

# Apply this decorator to performance-critical functions
@measure_execution_time
async def some_important_function():
    # Function implementation
    pass

# Add a function to get error statistics
def get_error_stats():
    return f"Total errors: {error_count}"

# Add a function to clear error count (e.g., after addressing issues)
def clear_error_count():
    global error_count
    error_count = 0
    db_logger.info("Error count has been reset")

async def create_profile(user_id: UUID, profile_data: dict):
    try:
        db_logger.info(f"Creating profile for user {user_id}")
        return await supabase.table('profiles').insert({"user_id": str(user_id), **profile_data}).execute()
    except Exception as e:
        db_logger.error(f"Error creating profile for user {user_id}: {str(e)}")
        raise

async def get_profile(user_id: UUID):
    try:
        db_logger.info(f"Fetching profile for user {user_id}")
        response = await supabase.table('profiles').select("*").eq("user_id", str(user_id)).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        db_logger.error(f"Error fetching profile for user {user_id}: {str(e)}")
        raise

async def create_user(user_id: UUID, user_data: dict):
    try:
        db_logger.info(f"Creating user {user_id} with data: {user_data}")
        return await supabase.table('users').insert({"id": str(user_id), **user_data}).execute()
    except Exception as e:
        db_logger.error(f"Error creating user {user_id}: {str(e)}")
        raise

async def get_user(user_id: UUID):
    try:
        db_logger.info(f"Fetching user {user_id}")
        response = await supabase.table('users').select("*").eq("id", str(user_id)).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        db_logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise

async def update_user(user: User):
    try:
        db_logger.info(f"Updating user {user.id} with data: {user}")
        response = await supabase.table('users').update(user.dict()).eq('id', str(user.id)).execute()
        return response.data
    except Exception as e:
        db_logger.error(f"Error updating user {user.id}: {str(e)}")
        raise

async def update_user_field(user_id: UUID, field: str, value: Any):
    try:
        db_logger.info(f"Updating {field} for user {user_id} to {value}")
        await supabase.table('users').update({field: value}).eq('id', str(user_id)).execute()
    except Exception as e:
        db_logger.error(f"Error updating {field} for user {user_id}: {str(e)}")
        raise

async def delete_user(user_id: str):
    try:
        result = await supabase.table('users').delete().eq('id', user_id).execute()
        return result.data
    except Exception as e:
        db_logger.error(f"Error deleting user: {str(e)}")
        raise

async def execute_sql(query: str):
    """Execute a SQL query."""
    try:
        response = await supabase_client.rpc("execute_sql", {"query": query}).execute()
        if response.error:
            db_logger.error(f"Error executing SQL: {response.error.message}")
            raise Exception(f"SQL execution error: {response.error.message}")
    except Exception as e:
        db_logger.error(f"Error in execute_sql: {str(e)}")
        raise

# Add this at the end of the file:
__all__ = ['create_profile', 'get_profile', 'create_user', 'get_user', 'update_user', 'verify_and_update_media', 'update_user_field', 'delete_user']