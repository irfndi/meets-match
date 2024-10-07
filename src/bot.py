import logging
import sys
import os
from telegram.ext import Application, CommandHandler, MessageHandler, filters
from dotenv import load_dotenv
from supabase import create_client, Client

# Add the project root directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers import start, preferences_conv_handler, matching_handler, handle_message
from database.initialization import initialize_database

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

def main() -> None:
    # Initialize bot with your token
    application = Application.builder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()

    # Initialize the database
    initialize_database(supabase)

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(preferences_conv_handler)
    application.add_handler(matching_handler)
    
    # Add a general message handler
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Error handler
    application.add_error_handler(error_handler)

    # Start the bot
    application.run_polling(allowed_updates=Update.ALL_TYPES)

def error_handler(update: object, context: CallbackContext) -> None:
    """Log Errors caused by Updates."""
    logger.warning('Update "%s" caused error "%s"', update, context.error)

if __name__ == "__main__":
    main()