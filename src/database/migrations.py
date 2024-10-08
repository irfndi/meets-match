from loguru import logger
from config import supabase_client, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from .schema import User, Preference, Match, Report
from supabase import create_client
import json
import traceback

class Migration:
    def __init__(self, version, description):
        self.version = version
        self.description = description

    async def up(self):
        raise NotImplementedError

    async def down(self):
        raise NotImplementedError

    async def check_schema(self):
        raise NotImplementedError

class CreateInitialTables(Migration):
    def __init__(self):
        super().__init__("0001", "Create initial tables")

    async def up(self):
        supabase_client.rpc("execute_sql", {"query": """
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                username TEXT UNIQUE NOT NULL,
                age INTEGER,
                gender TEXT,
                looking_for TEXT,
                city TEXT,
                name TEXT,
                bio TEXT,
                media JSONB DEFAULT '[]'::JSONB,
                language TEXT DEFAULT 'english',
                last_profile_check TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP - INTERVAL '30 days',
                profile_completed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Ensure the media column exists and is JSONB
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'media') THEN
                    ALTER TABLE users ADD COLUMN media JSONB DEFAULT '[]'::JSONB;
                ELSE
                    ALTER TABLE users ALTER COLUMN media TYPE JSONB USING COALESCE(media::JSONB, '[]'::JSONB);
                END IF;
            END $$;
        """}).execute()
        logger.info("Users table created or updated with media column as JSONB.")

        # Create other tables (preferences, matches, reports) similarly
        # ...

    async def down(self):
        supabase_client.rpc("execute_sql", {"query": """
            DROP TABLE IF EXISTS reports CASCADE;
            DROP TABLE IF EXISTS matches CASCADE;
            DROP TABLE IF EXISTS preferences CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
        """}).execute()
        logger.info("All tables dropped.")

    async def check_schema(self):
        response = supabase_client.rpc("execute_sql", {"query": """
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        """}).execute()
        
        required_columns = {
            'id': 'uuid',
            'username': 'text',
            'media': 'jsonb',
        }
        
        actual_columns = {col['column_name']: col['data_type'] for col in response.data}
        
        for col, dtype in required_columns.items():
            if col not in actual_columns or actual_columns[col] != dtype:
                logger.error(f"Required column {col} with type {dtype} not found or has incorrect type")
                return False
        
        return True

class AddInterestsToUsers(Migration):
    def __init__(self):
        super().__init__("0002", "Add interests to users table")

    async def up(self):
        supabase_client.rpc("execute_sql", {"query": """
            ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT[];
        """}).execute()
        logger.info("Interests column added to users table or already exists.")

    async def down(self):
        supabase_client.rpc("execute_sql", {"query": """
            ALTER TABLE users DROP COLUMN IF EXISTS interests;
        """}).execute()
        logger.info("Interests column dropped from users table.")

    async def check_schema(self):
        response = supabase_client.rpc("execute_sql", {"query": """
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'interests'
        """}).execute()
        
        return len(response.data) > 0 and response.data[0]['data_type'] == 'ARRAY'

class CreateUserMediaBucket(Migration):
    def __init__(self):
        super().__init__("0003", "Create user-media bucket")

    async def up(self):
        try:
            admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            buckets = admin_supabase.storage.list_buckets()
            if not any(bucket.name == "user-media" for bucket in buckets):
                admin_supabase.storage.create_bucket("user-media")
                logger.info("Created user-media bucket")
            else:
                logger.info("user-media bucket already exists")
        except Exception as e:
            logger.error(f"Error creating user-media bucket: {str(e)}")
            raise

    async def down(self):
        try:
            admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            admin_supabase.storage.delete_bucket("user-media")
            logger.info("Deleted user-media bucket")
        except Exception as e:
            logger.error(f"Error deleting user-media bucket: {str(e)}")
            raise

    async def check_schema(self):
        try:
            admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            buckets = admin_supabase.storage.list_buckets()
            return any(bucket.name == "user-media" for bucket in buckets)
        except Exception as e:
            logger.error(f"Error checking for user-media bucket: {str(e)}")
            return False

class EnsureMediaColumnExists(Migration):
    def __init__(self):
        super().__init__("0004", "Ensure media column exists in users table")

    async def up(self):
        supabase_client.rpc("execute_sql", {"query": """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'media') THEN
                    ALTER TABLE users ADD COLUMN media JSONB DEFAULT '[]'::JSONB;
                ELSE
                    ALTER TABLE users ALTER COLUMN media TYPE JSONB USING COALESCE(media::JSONB, '[]'::JSONB);
                END IF;
            END $$;
        """}).execute()
        logger.info("Ensured media column exists in users table.")

    async def down(self):
        # We don't want to remove the column in the down migration
        pass

    async def check_schema(self):
        response = supabase_client.rpc("execute_sql", {"query": """
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'media'
        """}).execute()
        
        logger.info(f"Media column check response: {response.data}")
        
        if len(response.data) == 0:
            logger.error("Media column not found in users table")
            return False
        
        if response.data[0]['data_type'] != 'jsonb':
            logger.error(f"Media column has incorrect data type: {response.data[0]['data_type']}")
            return False
        
        logger.info("Media column exists and has correct data type")
        return True

async def ensure_media_column():
    try:
        supabase_client.rpc("execute_sql", {"query": """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'media') THEN
                    ALTER TABLE users ADD COLUMN media JSONB DEFAULT '[]'::JSONB;
                END IF;
            END $$;
        """}).execute()
        logger.info("Ensured media column exists in users table.")
    except Exception as e:
        logger.error(f"Error ensuring media column: {str(e)}")

# Define the list of migrations
migrations = [
    CreateInitialTables(),
    AddInterestsToUsers(),
    CreateUserMediaBucket(),
    EnsureMediaColumnExists(),  # Add this new migration
    # Add more migrations here as your schema evolves
]

async def run_migrations():
    try:
        logger.info("Starting database migrations...")
        admin_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        # Check if migrations table exists, if not create it
        migrations_table_query = """
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            version TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """
        admin_supabase.rpc("execute_sql", {"query": migrations_table_query}).execute()

        # Get applied migrations
        applied_migrations = admin_supabase.table("migrations").select("version").execute()
        applied_versions = set(row['version'] for row in applied_migrations.data)

        # Ensure media column exists
        await ensure_media_column()

        for migration in migrations:
            if migration.version not in applied_versions:
                logger.info(f"Applying migration {migration.version}: {migration.description}")
                await migration.up()
                schema_check_result = await migration.check_schema()
                if schema_check_result:
                    admin_supabase.table("migrations").insert({"version": migration.version}).execute()
                    logger.info(f"Migration {migration.version} applied successfully")
                else:
                    logger.error(f"Schema check failed for migration {migration.version}")
                    return False
            else:
                logger.info(f"Migration {migration.version} already applied")

        logger.info("All migrations applied successfully")
        return True
    except Exception as e:
        logger.error(f"Error applying migrations: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

# Define schema validation queries for each migration
SCHEMA_VALIDATIONS = {
    '0001': """
    SELECT CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_name = 'users'
        ) THEN 'valid'
        ELSE 'invalid'
    END as result;
    """,
    '0002': """
    SELECT CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'interests'
        ) THEN 'valid'
        ELSE 'invalid'
    END as result;
    """
}

async def check_all_schemas():
    logger.info("Checking all schemas...")
    for migration in migrations:
        schema_check_result = await migration.check_schema()
        if schema_check_result:
            logger.info(f"Schema check passed for migration {migration.version}")
        else:
            logger.error(f"Schema check failed for migration {migration.version}")
    logger.info("Schema check completed")