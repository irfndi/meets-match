from .handlers import start, preferences_handler, matching_handler
from .database import supabase
from .bot import bot
from .config import TELEGRAM_BOT_TOKEN
from .utils import setup_logging

# Initialize bot and database connection
bot.set_my_commands([
    ("start", "Start the bot"),
    ("preferences", "Set your preferences"),
    ("match", "Find a match")
])

# Setup logging
logger = setup_logging()

# Initialize Supabase client
supabase.auth.sign_in_with_password({"email": "your-service-account@example.com", "password": "your-service-account-password"})

__all__ = ['start', 'preferences_handler', 'matching_handler', 'supabase', 'bot', 'logger']
