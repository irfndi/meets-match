import os
from dotenv import load_dotenv, dotenv_values
from supabase import create_client, Client
from loguru import logger
import re

# Print the current working directory
print(f"Current working directory: {os.getcwd()}")

# Print the contents of the .env file
env_path = os.path.join(os.getcwd(), '.env')
print(f"Attempting to read .env file from: {env_path}")
try:
    with open(env_path, 'r') as env_file:
        print("Contents of .env file:")
        print(env_file.read())
except FileNotFoundError:
    print(".env file not found!")
except Exception as e:
    print(f"Error reading .env file: {str(e)}")

# Load environment variables from .env file
load_dotenv()

# Add this after load_dotenv()
if not os.path.exists('.env'):
    logger.error(".env file not found. Please make sure it exists in the project root directory.")
    raise FileNotFoundError(".env file not found")

print("Debug - .env file found and loaded")

# Debug: Print all environment variables (remove this in production)
print("Debug - Environment Variables:")
for key, value in os.environ.items():
    if key in ['TELEGRAM_BOT_TOKEN', 'SUPABASE_PUBLIC_KEY', 'SUPABASE_SERVICE_ROLE_KEY']:
        print(f"{key}: {value}")  # Print actual value for debugging
    else:
        print(f"{key}: {value}")

# Manually load environment variables
config = dotenv_values(".env")
print("Manually loaded environment variables:")
for key, value in config.items():
    print(f"{key}: {value}")

# Get environment variables
TELEGRAM_BOT_TOKEN = config.get('TELEGRAM_BOT_TOKEN', '').strip()
SUPABASE_URL = config.get('SUPABASE_URL')
SUPABASE_PUBLIC_KEY = config.get('SUPABASE_PUBLIC_KEY')
SUPABASE_SERVICE_ROLE_KEY = config.get('SUPABASE_SERVICE_ROLE_KEY')

# Add this after getting the TELEGRAM_BOT_TOKEN
print(f"Debug - Raw TELEGRAM_BOT_TOKEN: {os.getenv('TELEGRAM_BOT_TOKEN')}")

# Check if all required environment variables are set
required_vars = {
    'TELEGRAM_BOT_TOKEN': TELEGRAM_BOT_TOKEN,
    'SUPABASE_URL': SUPABASE_URL,
    'SUPABASE_PUBLIC_KEY': SUPABASE_PUBLIC_KEY,
    'SUPABASE_SERVICE_ROLE_KEY': SUPABASE_SERVICE_ROLE_KEY
}

missing_vars = [var for var, value in required_vars.items() if not value]

if missing_vars:
    logger.error(f"Missing environment variables: {', '.join(missing_vars)}")
    logger.error("Please check your .env file and ensure all required variables are set.")
    raise ValueError("Missing environment variables")

# Validate Telegram bot token format (more flexible regex)
if not re.match(r'^\d+:[A-Za-z0-9_-]{30,}$', TELEGRAM_BOT_TOKEN):
    logger.error(f"Invalid Telegram bot token format: '{TELEGRAM_BOT_TOKEN}'")
    logger.error(f"Token length: {len(TELEGRAM_BOT_TOKEN)}")
    logger.error("Token should start with numbers, followed by a colon and a string of characters.")
    logger.error("Please check your .env file and ensure the TELEGRAM_BOT_TOKEN is correct.")
    raise ValueError("Invalid Telegram bot token format")

# Initialize Supabase client
try:
    supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_PUBLIC_KEY)
    logger.info("Supabase client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {str(e)}")
    raise

# Add any other configuration variables here
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
MAX_REQUESTS_PER_MINUTE = int(os.getenv('MAX_REQUESTS_PER_MINUTE', 60))
USERS_TABLE = os.getenv('USERS_TABLE', 'users')

# Configure logger
logger.remove()  # Remove default handler
logger.add(
    "bot.log",
    rotation="500 MB",
    retention="10 days",
    level=LOG_LEVEL,
    format="{time:YYYY-MM-DD at HH:mm:ss} | {level} | {message}"
)
logger.add(lambda msg: print(msg, end=""), level=LOG_LEVEL)

# Log all configuration variables (except sensitive ones)
logger.info("Configuration loaded:")
logger.info(f"LOG_LEVEL: {LOG_LEVEL}")
logger.info(f"MAX_REQUESTS_PER_MINUTE: {MAX_REQUESTS_PER_MINUTE}")
logger.info(f"USERS_TABLE: {USERS_TABLE}")
logger.info(f"SUPABASE_URL: {SUPABASE_URL}")

# Log a masked version of the Telegram bot token for debugging
masked_token = f"{TELEGRAM_BOT_TOKEN[:8]}...{TELEGRAM_BOT_TOKEN[-4:]}" if len(TELEGRAM_BOT_TOKEN) > 12 else "Invalid Token"
logger.info(f"TELEGRAM_BOT_TOKEN: {masked_token}")

# Debug: Print the actual token (remove this in production)
print(f"Debug - TELEGRAM_BOT_TOKEN: {TELEGRAM_BOT_TOKEN}")

# Add this line for MEDIA_CACHE_DIR
MEDIA_CACHE_DIR = os.path.join(os.getcwd(), 'media_cache')

if __name__ == "__main__":
    print("Configuration loaded successfully.")