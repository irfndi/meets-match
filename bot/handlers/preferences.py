# This file contains code for preferences handlers
from telegram import Update
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, MessageHandler, filters
from database import get_supabase_client, update_user_preferences
from utils import validate_age_range, parse_interests
import logging

logger = logging.getLogger(__name__)

# Define conversation states
AGE_RANGE, GENDER_PREFERENCE, INTERESTS = range(3)

async def start_preferences(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Let's set up your preferences. First, what age range are you interested in? (e.g., 25-35)")
    return AGE_RANGE

async def handle_age_range(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        age_min, age_max = validate_age_range(update.message.text)
        context.user_data['age_min'] = age_min
        context.user_data['age_max'] = age_max
        await update.message.reply_text("Great! Now, what gender are you interested in? (Male/Female/Both)")
        return GENDER_PREFERENCE
    except ValueError as e:
        await update.message.reply_text(str(e))
        return AGE_RANGE

async def handle_gender_preference(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    gender_preference = update.message.text.lower()
    if gender_preference in ['male', 'female', 'both']:
        context.user_data['gender_preference'] = gender_preference
        await update.message.reply_text("Excellent! Lastly, what are your interests? (Separate with commas)")
        return INTERESTS
    else:
        await update.message.reply_text("Please enter 'Male', 'Female', or 'Both'.")
        return GENDER_PREFERENCE

async def handle_interests(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    interests = parse_interests(update.message.text)
    context.user_data['interests'] = interests
    
    # Save preferences to database
    user_id = update.effective_user.id
    preferences = {
        'age_min': context.user_data['age_min'],
        'age_max': context.user_data['age_max'],
        'gender_preference': context.user_data['gender_preference'],
        'interests': context.user_data['interests']
    }
    try:
        await update_user_preferences(user_id, preferences)
        await update.message.reply_text("Your preferences have been saved!")
    except Exception as e:
        logger.error(f"Error saving preferences: {e}")
        await update.message.reply_text("There was an error saving your preferences. Please try again later.")
    
    return ConversationHandler.END

preferences_conv_handler = ConversationHandler(
    entry_points=[CommandHandler('preferences', start_preferences)],
    states={
        AGE_RANGE: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_age_range)],
        GENDER_PREFERENCE: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_gender_preference)],
        INTERESTS: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_interests)],
    },
    fallbacks=[],
)
