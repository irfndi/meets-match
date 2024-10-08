from supabase import create_client, Client
from postgrest import APIError  # Add this import
from storage3.utils import StorageException
from .schema import User, Preference, Match, Report
from config import SUPABASE_URL, SUPABASE_PUBLIC_KEY, SUPABASE_SERVICE_ROLE_KEY, supabase_client, MEDIA_CACHE_DIR  # Changed from SUPABASE_SERVICE_ROLE_KEY
from loguru import logger
import json
from uuid import UUID
from datetime import datetime
from dataclasses import fields
from .migrations import run_migrations, check_all_schemas  # Import run_migrations and check_all_schemas from migrations.py
import traceback
import os
import aiohttp
import asyncio
try:
    import aiofiles
except ImportError:
    aiofiles = None
    print("Warning: aiofiles module not found. Some file operations may not work as expected.")
from config import MEDIA_CACHE_DIR

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return json.JSONEncoder.default(self, obj)

async def setup_database(supabase):
    try:
        # Verify database connection
        if not verify_database_connection(supabase):
            logger.error("Failed to verify database connection")
            return False
        logger.info("Database connection verified successfully")

        # Ensure media cache directory exists
        ensure_media_cache_dir()

        # Apply migrations
        migrations_success = await run_migrations()
        
        if not migrations_success:
            logger.warning("Migration process encountered issues. Attempting to continue with existing schema.")

        # Perform a final schema check
        await check_all_schemas()

        # Ensure media column exists as a final safeguard
        from .migrations import ensure_media_column
        await ensure_media_column()

        logger.info("Database setup completed")
        return True
    except Exception as e:
        logger.error(f"Error during database setup: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

def verify_database_connection(supabase):
    try:
        response = supabase.table('users').select('id').limit(1).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to verify database connection: {str(e)}")
        return False

async def create_users_table():
    query = """
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username TEXT UNIQUE NOT NULL,
        age INTEGER,
        gender TEXT,
        looking_for TEXT,
        city TEXT,
        name TEXT,
        bio TEXT,
        photos TEXT[],
        language TEXT DEFAULT 'english',
        last_profile_check TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP - INTERVAL '30 days',
        profile_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
    """
    supabase_client.rpc("execute_sql", {"query": query}).execute()

async def create_preferences_table():
    query = """
    CREATE TABLE IF NOT EXISTS preferences (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        age_min INTEGER,
        age_max INTEGER,
        gender_preference TEXT,
        interests TEXT[],
        max_distance INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
    """
    supabase_client.rpc("execute_sql", {"query": query}).execute()

async def create_matches_table():
    query = """
    CREATE TABLE IF NOT EXISTS matches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user1_id UUID REFERENCES users(id),
        user2_id UUID REFERENCES users(id),
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
    """
    supabase_client.rpc("execute_sql", {"query": query}).execute()

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
    )
    """
    supabase_client.rpc("execute_sql", {"query": query}).execute()

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
        logger.error(f"Error setting up RLS policies: {str(e)}")
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

async def create_user(user: User):
    try:
        user_dict = {k: v for k, v in user.__dict__.items() if v is not None}
        json_data = json.dumps(user_dict, cls=CustomJSONEncoder)
        
        # Use the service role key for admin operations
        admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        # Check if user already exists
        existing_user = await get_user(user.username)
        if existing_user:
            # Update existing user
            response = admin_supabase.table("users").update(json.loads(json_data)).eq("username", user.username).execute()
            logger.info(f"User updated successfully: {user.username}")
        else:
            # Create new user
            response = admin_supabase.table("users").insert(json.loads(json_data)).execute()
            logger.info(f"User created successfully: {user.username}")
        
        return response.data[0] if response.data else None
    except APIError as e:
        if e.code == '23505':  # Unique constraint violation
            logger.warning(f"User {user.username} already exists. Updating instead.")
            response = admin_supabase.table("users").update(json.loads(json_data)).eq("username", user.username).execute()
            return response.data[0] if response.data else None
        else:
            logger.error(f"Error creating/updating user: {str(e)}")
            raise
    except Exception as e:
        logger.error(f"Error creating/updating user: {str(e)}")
        raise

async def create_bucket_if_not_exists(bucket_name: str = "user-media"):
    try:
        admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        buckets = admin_supabase.storage.list_buckets()
        if not any(bucket.name == bucket_name for bucket in buckets):
            admin_supabase.storage.create_bucket(bucket_name)
            logger.info(f"Created new bucket: {bucket_name}")
        else:
            logger.info(f"Bucket {bucket_name} already exists")
    except Exception as e:
        logger.error(f"Error creating bucket: {str(e)}")
        raise

async def upload_file_to_bucket(file, file_name: str, bucket_name: str = "user-media"):
    try:
        await create_bucket_if_not_exists(bucket_name)
        
        file_content = await file.download_as_bytearray()
        
        admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        response = admin_supabase.storage.from_(bucket_name).upload(file_name, file_content)
        
        if not response:
            raise Exception("No response received from Supabase storage upload")
        
        public_url = admin_supabase.storage.from_(bucket_name).get_public_url(file_name)
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
        logger.error(f"Error downloading file from Telegram: {str(e)}")
        raise

async def update_user(user: User) -> bool:
    try:
        user_dict = {k: v for k, v in user.__dict__.items() if v is not None}
        
        # Ensure media is stored as a JSON string
        if isinstance(user_dict.get('media'), list):
            user_dict['media'] = json.dumps(user_dict['media'])
        
        # Remove fields that are not in the database schema
        db_fields = ['id', 'username', 'age', 'gender', 'looking_for', 'city', 'name', 'bio', 'media', 'language', 'last_profile_check', 'profile_completed', 'created_at', 'updated_at', 'interests']
        filtered_user_dict = {k: v for k, v in user_dict.items() if k in db_fields}
        
        json_data = json.dumps(filtered_user_dict, cls=CustomJSONEncoder)
        
        admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        response = admin_supabase.table("users").update(json.loads(json_data)).eq("username", user.username).execute()

        if response.data:
            logger.info(f"User {user.username} updated successfully")
            return True
        else:
            logger.error(f"No data returned when updating user {user.username}")
            return False

    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

async def verify_media_url(url: str) -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.head(url) as response:
                return response.status == 200
    except:
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
                        if aiofiles:
                            async with aiofiles.open(cache_path, 'wb') as f:
                                await f.write(await response.read())
                        else:
                            with open(cache_path, 'wb') as f:
                                f.write(await response.read())
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

async def get_or_create_user(username: str) -> User:
    try:
        logger.info(f"Attempting to retrieve or create user data for username: {username}")
        admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        response = admin_supabase.table("users").select("*").eq("username", username).execute()
        logger.info(f"Database response: {response}")
        
        if response.data:
            user_data = response.data[0]
            user_data['id'] = UUID(user_data['id'])
            
            # Handle the media field
            if isinstance(user_data.get('media'), str):
                user_data['media'] = json.loads(user_data.get('media', '[]'))
            elif user_data.get('media') is None:
                user_data['media'] = []
            
            # Remove fields that are not in the User model
            user_fields = {f.name for f in fields(User)}
            filtered_user_data = {k: v for k, v in user_data.items() if k in user_fields}
            
            user = User(**filtered_user_data)
            logger.info(f"Existing user retrieved: {user}")
            
            # Check if the user has media
            if not user.media:
                logger.warning(f"User {username} has no media")
                user.profile_completed = False
            
            return user
        else:
            new_user = User(username=username)
            user_dict = {k: v for k, v in new_user.__dict__.items() if v is not None}
            user_dict['media'] = json.dumps([])  # Initialize media as empty JSON array
            json_data = json.dumps(user_dict, cls=CustomJSONEncoder)
            insert_response = admin_supabase.table("users").insert(json.loads(json_data)).execute()
            
            if insert_response.data:
                created_user_data = insert_response.data[0]
                created_user_data['id'] = UUID(created_user_data['id'])
                created_user_data['media'] = []  # Initialize media as empty list
                created_user = User(**created_user_data)
                logger.info(f"New user created: {created_user}")
                return created_user
            else:
                raise Exception("Failed to create new user")
    except Exception as e:
        logger.error(f"Error in get_or_create_user: {str(e)}")
        logger.error(traceback.format_exc())
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
    logger.info("Users table and related tables recreated successfully")

# Implement similar functions for preferences, matches, and reports as needed

# Add this function to periodically check and update media
async def periodic_media_check():
    admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    users = admin_supabase.table("users").select("*").execute()
    
    for user_data in users.data:
        user = User(**user_data)
        updated_user = await verify_and_update_media(user)
        if updated_user.media != user.media:
            await update_user(updated_user)
            # TODO: Implement user notification system
            logger.info(f"Updated media for user {user.username}")

def ensure_media_cache_dir():
    if not os.path.exists(MEDIA_CACHE_DIR):
        os.makedirs(MEDIA_CACHE_DIR)
        logger.info(f"Created media cache directory: {MEDIA_CACHE_DIR}")
    else:
        logger.info(f"Media cache directory already exists: {MEDIA_CACHE_DIR}")