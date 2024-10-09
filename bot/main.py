import asyncio
from telegram.ext import ApplicationBuilder
from bot.config import TELEGRAM_BOT_TOKEN
from loguru import logger

async def main():
    application = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    
    try:
        await application.initialize()  # Initialize the application
        await application.start()  # Start the application
        await application.run_polling()  # Run the bot
    except Exception as e:
        logger.error(f"Error in main function: {str(e)}")
        raise
    finally:
        await application.stop()  # Stop the application

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except RuntimeError as e:
        logger.error(f"Unhandled exception: {str(e)}")