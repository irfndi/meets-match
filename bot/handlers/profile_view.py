from loguru import logger
from telegram import Update
from telegram.ext import ContextTypes
from database.db_operations import get_user
from utils.keyboards import get_profile_keyboard
from bot.states import PROFILE_MENU
from bot.handlers.media import load_profile_media

# ... (rest of the code remains the same)