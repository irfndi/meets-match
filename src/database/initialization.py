from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY
import logging
from .schema import (
    ensure_table_schema, 
    USERS_SCHEMA, MATCHES_SCHEMA, REPORTS_SCHEMA, PREFERENCES_SCHEMA,
)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def initialize_database():
    tables = [
        ('users', USERS_SCHEMA),
        ('matches', MATCHES_SCHEMA),
        ('reports', REPORTS_SCHEMA),
        ('preferences', PREFERENCES_SCHEMA),
    ]
    
    try:
        for table_name, schema in tables:
            ensure_table_schema(table_name, schema)
        
        logger.info("Database initialization completed successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        raise

def create_storage_bucket(bucket_name="profile_images"):
    try:
        supabase.storage.create_bucket(bucket_name)
        logger.info(f"Storage bucket '{bucket_name}' created successfully.")
    except Exception as e:
        if "already exists" in str(e):
            logger.info(f"Storage bucket '{bucket_name}' already exists. Skipping creation.")
        else:
            logger.error(f"Error creating storage bucket: {str(e)}")
            raise

def setup():
    initialize_database()
    create_storage_bucket()

if __name__ == "__main__":
    setup()
