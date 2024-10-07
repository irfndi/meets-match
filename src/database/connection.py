from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY
import os

# Initialize Supabase client
supabase: Client = create_client(
    supabase_url=os.environ.get('SUPABASE_URL', SUPABASE_URL),
    supabase_key=os.environ.get('SUPABASE_KEY', SUPABASE_KEY)
)

# Configure default schema if using custom schema
supabase.postgrest.schema('public')

# Enable automatic retries on connection errors
supabase.postgrest.retries(3)

# Set up error handling
try:
    # Test connection
    supabase.table('test').select('*').limit(1).execute()
    print("Successfully connected to Supabase")
except Exception as e:
    print(f"Error connecting to Supabase: {str(e)}")
    # Handle connection error (e.g. log, raise custom exception, etc.)