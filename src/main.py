import logging
import asyncio
from telegram.ext import ApplicationBuilder, CommandHandler
from config import TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY
from handlers import start_handler, create_profile_handler, view_profile_handler, edit_profile_handler, set_preferences_handler, view_matches_handler, report_handler, block_handler
from supabase import create_client, Client

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

logger = logging.getLogger(__name__)

async def main():
    try:
        # Initialize Supabase client
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

        # Build application with persistent bot data
        application = (
            ApplicationBuilder()
            .token(TELEGRAM_BOT_TOKEN)
            .persistence(PicklePersistence(filename="bot_data"))
            .build()
        )
        
        # Add handlers
        application.add_handler(CommandHandler("start", start_handler))
        application.add_handler(CommandHandler("createprofile", create_profile_handler))
        application.add_handler(CommandHandler("viewprofile", view_profile_handler))
        application.add_handler(CommandHandler("editprofile", edit_profile_handler))
        application.add_handler(CommandHandler("setpreferences", set_preferences_handler))
        application.add_handler(CommandHandler("viewmatches", view_matches_handler))
        application.add_handler(CommandHandler("report", report_handler))
        application.add_handler(CommandHandler("block", block_handler))
        
        logger.info("Bot started. Press Ctrl+C to stop.")
        await application.initialize()
        await application.start()
        await application.run_polling(allowed_updates=["message", "callback_query"])
    except Exception as e:
        logger.error(f"Error occurred: {e}")
    finally:
        await application.stop()

if __name__ == '__main__':
    asyncio.run(main())