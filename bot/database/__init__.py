from dotenv import load_dotenv
import os
from supabase import create_client, Client
from .db_operations import (
    create_profile, 
    get_profile, 
    create_user, 
    get_user, 
    update_user, 
    delete_user,  # Ensure this is included
    verify_and_update_media, 
    setup_database, 
    get_or_create_user, 
    update_user_field
)

# Load environment variables from .env file
load_dotenv()

# Ensure these environment variables are set correctly
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Ensure this is the correct key

if not url or not key:
    raise ValueError("Supabase URL and Key must be set in environment variables.")

supabase: Client = create_client(url, key)

# Other imports and functions...