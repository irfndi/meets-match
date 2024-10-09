from loguru import logger
from telegram import Update, ReplyKeyboardMarkup
from telegram.ext import ContextTypes
from bot.database.db_operations import get_or_create_user, update_user_field  # Ensure this import is correct
from bot.utils.keyboards import get_profile_keyboard, get_update_profile_keyboard, get_back_keyboard
from bot.states import PROFILE_MENU, UPDATE_PROFILE, AGE_INPUT, NAME_INPUT, GENDER_INPUT, LOOKING_FOR_INPUT, CITY_INPUT, BIO_INPUT

async def start_profile_creation(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['profile_creation_step'] = 'name'
    await update.message.reply_text("Let's create your profile! What's your name?")

async def handle_profile_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get('profile_creation_step')
    
    if step == 'name':
        context.user_data['name'] = update.message.text
        context.user_data['profile_creation_step'] = 'age'
        await update.message.reply_text("Great! Now, what's your age?")
    elif step == 'age':
        # Add age validation here
        context.user_data['age'] = update.message.text
        context.user_data['profile_creation_step'] = 'bio'
        await update.message.reply_text("Awesome! Finally, tell me a bit about yourself (your bio):")
    elif step == 'bio':
        context.user_data['bio'] = update.message.text
        # Save profile to database here
        del context.user_data['profile_creation_step']
        await update.message.reply_text("Your profile has been created successfully!")
    else:
        await update.message.reply_text("I'm not sure what you mean. Use /create_profile to start creating your profile.")