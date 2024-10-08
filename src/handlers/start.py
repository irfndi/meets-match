from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, MessageHandler, filters
from database import create_profile, get_profile, create_user, get_user
from utils import validate_age, validate_gender, get_main_menu_keyboard, get_gender_keyboard, MIN_AGE, MAX_AGE
from uuid import uuid4
import logging

logger = logging.getLogger(__name__)

# Define conversation states
USERNAME, FIRST_NAME, LAST_NAME, AGE, GENDER, BIO = range(6)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    user_id = uuid4()  # Generate a new UUID for the user
    
    try:
        existing_user = await get_user(user_id)
        if existing_user:
            await update.message.reply_text(f"Welcome back, {existing_user.first_name}!", reply_markup=get_main_menu_keyboard())
            return ConversationHandler.END
    except Exception as e:
        logger.error(f"Error fetching user: {e}")
        # If there's an error fetching the user, we'll proceed with creating a new profile
    
    await update.message.reply_text(f"Welcome! Let's create your profile. First, choose a username:")
    return USERNAME

async def handle_username(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['username'] = update.message.text
    await update.message.reply_text(f"Great! Now, what's your first name?")
    return FIRST_NAME

async def handle_first_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['first_name'] = update.message.text
    await update.message.reply_text(f"Nice to meet you, {context.user_data['first_name']}! What's your last name?")
    return LAST_NAME

async def handle_last_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['last_name'] = update.message.text
    await update.message.reply_text(f"How old are you?")
    return AGE

async def handle_age(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    age = update.message.text
    if validate_age(age, MIN_AGE, MAX_AGE):
        context.user_data['age'] = int(age)
        await update.message.reply_text("What's your gender?", reply_markup=get_gender_keyboard())
        return GENDER
    await update.message.reply_text(f"Please enter a valid age between {MIN_AGE} and {MAX_AGE}.")
    return AGE

async def handle_gender(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    gender = update.message.text
    if validate_gender(gender):
        context.user_data['gender'] = gender
        await update.message.reply_text("Finally, tell us a bit about yourself (your bio):")
        return BIO
    await update.message.reply_text("Please select a valid gender option.")
    return GENDER

async def handle_bio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['bio'] = update.message.text
    user = update.effective_user
    
    try:
        new_user = await create_user(
            username=context.user_data['username'],
            first_name=context.user_data['first_name'],
            last_name=context.user_data['last_name'],
            bio=context.user_data['bio']
        )
        
        await create_profile(
            user_id=new_user.id,
            age=context.user_data['age'],
            gender=context.user_data['gender'],
            interests={},
            photo_url=user.get_profile_photos().photos[0][-1].file_id if user.get_profile_photos().photos else None
        )
        
        await update.message.reply_text(
            "Great! Your Nova Match profile is complete. Start exploring matches now!",
            reply_markup=get_main_menu_keyboard()
        )
    except Exception as e:
        logger.error(f"Error creating user profile: {e}")
        await update.message.reply_text("An error occurred while creating your profile. Please try again later.")
    
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "Profile creation cancelled. You can start over with /start",
        reply_markup=ReplyKeyboardMarkup([[KeyboardButton("/start")]], resize_keyboard=True)
    )
    return ConversationHandler.END

def setup_handlers(application):
    start_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            USERNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_username)],
            FIRST_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_first_name)],
            LAST_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_last_name)],
            AGE: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_age)],
            GENDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_gender)],
            BIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_bio)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    )
    application.add_handler(start_handler)