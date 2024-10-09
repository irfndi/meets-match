from telegram import Update
from telegram.ext import ContextTypes, CommandHandler, Application
from bot.utils import get_main_menu_keyboard

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = get_main_menu_keyboard()
    await context.bot.send_message(chat_id=update.effective_chat.id, text="Welcome!", reply_markup=keyboard)

async def setup_handlers(application: Application):
    application.add_handler(CommandHandler("start", start))
    # Add other handlers as needed