from telegram import Update
from telegram.ext import ContextTypes

async def send_error_message(update: Update, context: ContextTypes.DEFAULT_TYPE, error_message: str):
    await update.message.reply_text(f"Error: {error_message}", parse_mode='MarkdownV2')

# Add any other handler-specific utility functions here