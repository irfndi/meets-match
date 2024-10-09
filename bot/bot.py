import asyncio
from bot.config import TELEGRAM_BOT_TOKEN, supabase_client, USERS_TABLE, MAX_REQUESTS_PER_MINUTE, LOG_LEVEL, SUPABASE_URL, MEDIA_CACHE_DIR
from bot.handlers.start import start, setup_handlers
from telegram.ext import Application

# Add other necessary imports and bot setup code here

async def main():
    # Create the application
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # Set up command and message handlers
    setup_handlers(application)

    # Start the bot
    await application.initialize()
    await application.start()
    await application.run_polling()

if __name__ == '__main__':
    asyncio.run(main())