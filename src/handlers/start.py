from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, CallbackQueryHandler, MessageHandler, filters
from database.users import user_has_profile, create_user_profile, get_user_profile
from .preferences_handler import preferences_handler
from utils.validators import validate_age, validate_gender
from utils.keyboards import get_main_menu_keyboard, get_gender_keyboard
from utils.constants import MIN_AGE, MAX_AGE

# Define conversation states
CREATING_PROFILE, NAME, AGE, GENDER, BIO = range(5)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    if user_has_profile(user.id):
        profile = get_user_profile(user.id)
        await update.message.reply_text(
            f"Welcome back, {profile.name}!",
            reply_markup=get_main_menu_keyboard()
        )
        return ConversationHandler.END
    else:
        keyboard = [[InlineKeyboardButton("Create Profile", callback_data="create_profile")]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            f"Welcome, {user.first_name}! You don't have a profile yet. Would you like to create one?",
            reply_markup=reply_markup
        )
        return CREATING_PROFILE

async def create_profile_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text("Great! Let's create your profile. What's your name?")
    return NAME

async def handle_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['name'] = update.message.text
    await update.message.reply_text(f"Nice to meet you, {context.user_data['name']}! Now, how old are you?")
    return AGE

async def handle_age(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    age = update.message.text
    if validate_age(age, MIN_AGE, MAX_AGE):
        context.user_data['age'] = int(age)
        await update.message.reply_text("What's your gender?", reply_markup=get_gender_keyboard())
        return GENDER
    else:
        await update.message.reply_text(f"Please enter a valid age between {MIN_AGE} and {MAX_AGE}.")
        return AGE

async def handle_gender(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    gender = update.message.text
    if validate_gender(gender):
        context.user_data['gender'] = gender
        await update.message.reply_text("Finally, tell us a bit about yourself (your bio):")
        return BIO
    else:
        await update.message.reply_text("Please select a valid gender option.")
        return GENDER

async def handle_bio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['bio'] = update.message.text
    user = update.effective_user
    create_user_profile(user.id, context.user_data)
    await update.message.reply_text(
        "Great! Your Nova Match profile is complete. Start exploring matches now!",
        reply_markup=get_main_menu_keyboard()
    )
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
            CREATING_PROFILE: [CallbackQueryHandler(create_profile_callback, pattern="^create_profile$")],
            NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_name)],
            AGE: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_age)],
            GENDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_gender)],
            BIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_bio)],
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    )
    application.add_handler(start_handler)