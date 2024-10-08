from telegram import Update
from telegram.ext import ContextTypes
import logging

logger = logging.getLogger(__name__)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle incoming messages that are not commands."""
    text = update.message.text
    logger.info(f"Received message: {text}")
    await update.message.reply_text("I received your message. If you need help, use /help command.")