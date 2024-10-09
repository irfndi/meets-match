import os
from dotenv import load_dotenv
from loguru import logger
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

# Define global configuration variables
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
SUPABASE_PUBLIC_KEY = os.getenv('SUPABASE_PUBLIC_KEY')  # Ensure this is set
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
JWT_SUPABASE = os.getenv("JWT_SUPABASE")

# Initialize Supabase client
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Define other constants
MEDIA_CACHE_DIR = os.path.join(os.getcwd(), 'media_cache')
USERS_TABLE = 'users'
MAX_REQUESTS_PER_MINUTE = 60
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

# Create media cache directory if it doesn't exist
os.makedirs(MEDIA_CACHE_DIR, exist_ok=True)

# Configure logger
logger.add("bot.log", rotation="500 MB", retention="10 days", level=LOG_LEVEL)

# Export the logger
db_logger = logger

# Initialize supabase variable
supabase = supabase_client  # Use the initialized client