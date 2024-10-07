from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, MessageHandler, filters
from supabase import create_client, Client

# Initialize Supabase client
url: str = "YOUR_SUPABASE_URL"
key: str = "YOUR_SUPABASE_KEY"
supabase: Client = create_client(url, key)

# Define conversation states
GENDER, AGE, LOCATION = range(3)

async def preferences_handler(update: Update, context: ContextTypes.DEFAULT_TYPE, is_callback=False) -> int:
    keyboard = [['Male', 'Female', 'Other']]
    reply_markup = ReplyKeyboardMarkup(keyboard, one_time_keyboard=True)
    message = "Let's set up your profile. First, what's your gender?"
    if is_callback:
        await update.callback_query.message.reply_text(message, reply_markup=reply_markup)
    else:
        await update.message.reply_text(message, reply_markup=reply_markup)
    return GENDER

async def gender(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.message.from_user
    context.user_data['gender'] = update.message.text
    await update.message.reply_text("Great! Now, what's your age?", reply_markup=ReplyKeyboardRemove())
    return AGE

async def age(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.message.from_user
    if not update.message.text.isdigit():
        await update.message.reply_text("Please enter a valid number for your age.")
        return AGE
    context.user_data['age'] = int(update.message.text)
    await update.message.reply_text("Awesome! Finally, what's your location?")
    return LOCATION

async def location(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.message.from_user
    context.user_data['location'] = update.message.text
    
    # Save profile to Supabase
    user_id = update.effective_user.id
    profile_data = {
        'user_id': user_id,
        'gender': context.user_data['gender'],
        'age': context.user_data['age'],
        'location': context.user_data['location']
    }
    
    try:
        response = supabase.table('user_profiles').upsert(profile_data).execute()
        await update.message.reply_text("Thank you! Your profile has been created and saved.")
    except Exception as e:
        await update.message.reply_text("There was an error saving your profile. Please try again later.")
        print(f"Error saving profile: {str(e)}")
    
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Profile creation cancelled.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

preferences_conv_handler = ConversationHandler(
    entry_points=[CommandHandler("preferences", preferences_handler)],
    states={
        GENDER: [MessageHandler(filters.Regex('^(Male|Female|Other)$'), gender)],
        AGE: [MessageHandler(filters.TEXT & ~filters.COMMAND, age)],
        LOCATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, location)],
    },
    fallbacks=[CommandHandler("cancel", cancel)],
)