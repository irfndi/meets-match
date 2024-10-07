# This file contains code for preferences handlers
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import CallbackContext, ConversationHandler, CommandHandler, MessageHandler, filters, CallbackQueryHandler, ContextTypes
from database import supabase
from utils.helpers import update_user_preferences

# Define conversation states
GENDER, AGE_RANGE, INTERESTS, NOTIFICATIONS, TOPICS = range(5)

async def start_preferences(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    keyboard = [
        [InlineKeyboardButton("Male", callback_data='male'),
         InlineKeyboardButton("Female", callback_data='female')],
        [InlineKeyboardButton("Other", callback_data='other')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Let's set your preferences! What gender are you interested in?", reply_markup=reply_markup)
    return GENDER

async def gender(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data['gender_preference'] = query.data
    await query.edit_message_text("Great! Now, what age range are you interested in? (e.g., 20-30)")
    return AGE_RANGE

async def age_range(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    if '-' not in text or len(text.split('-')) != 2:
        await update.message.reply_text("Please enter the age range in the correct format (e.g., '20-30').")
        return AGE_RANGE
    min_age, max_age = map(int, text.split('-'))
    context.user_data['age_range'] = {'min': min_age, 'max': max_age}
    await update.message.reply_text("Excellent! What are your interests? (Separate with commas)")
    return INTERESTS

async def interests(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['interests'] = [interest.strip() for interest in update.message.text.split(',')]
    await update.message.reply_text("Would you like to receive notifications? (yes/no)")
    return NOTIFICATIONS

async def notifications(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    response = update.message.text.lower()
    if response in ['yes', 'y']:
        context.user_data['notifications'] = True
    elif response in ['no', 'n']:
        context.user_data['notifications'] = False
    else:
        await update.message.reply_text('Please respond with "yes" or "no".')
        return NOTIFICATIONS
    
    await update.message.reply_text("What topics are you interested in? (e.g., sports, music)")
    return TOPICS

async def topics(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['topics'] = [topic.strip() for topic in update.message.text.split(',')]
    
    user_id = update.effective_user.id
    
    # Save preferences to Supabase
    supabase.table('preferences').upsert({
        'user_id': user_id,
        'gender_preference': context.user_data['gender_preference'],
        'min_age': context.user_data['age_range']['min'],
        'max_age': context.user_data['age_range']['max'],
        'interests': context.user_data['interests'],
        'notifications': context.user_data['notifications'],
        'topics': context.user_data['topics']
    }).execute()

    await update.message.reply_text("Your preferences have been saved!")
    return ConversationHandler.END

async def cancel(update: Update, context: CallbackContext) -> int:
    await update.message.reply_text("Preferences setting cancelled.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

preferences_handler = ConversationHandler(
    entry_points=[CommandHandler('set_preferences', start_preferences)],
    states={
        GENDER: [CallbackQueryHandler(gender)],
        AGE_RANGE: [MessageHandler(filters.TEXT & ~filters.COMMAND, age_range)],
        INTERESTS: [MessageHandler(filters.TEXT & ~filters.COMMAND, interests)],
        NOTIFICATIONS: [MessageHandler(filters.TEXT & ~filters.COMMAND, notifications)],
        TOPICS: [MessageHandler(filters.TEXT & ~filters.COMMAND, topics)],
    },
    fallbacks=[CommandHandler('cancel', cancel)],
)
