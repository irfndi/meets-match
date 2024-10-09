from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes
from supabase import create_client, Client
from bot.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == 'view_profiles':
        profiles = supabase.table('profiles').select('*').execute()
        profile_text = "Here are some profiles for you to view:\n\n"
        for profile in profiles.data:
            profile_text += f"- {profile['name']}\n"
        await query.message.reply_text(profile_text)
    elif query.data == 'my_profile':
        user_id = update.effective_user.id
        profile = supabase.table('profiles').select('*').eq('user_id', user_id).execute()
        if profile.data:
            await query.message.reply_text(f"Here's your profile:\n\n{profile.data[0]}")
        else:
            await query.message.reply_text("You don't have a profile yet. Would you like to create one?")
    elif query.data == 'stop_search':
        user_id = update.effective_user.id
        supabase.table('users').update({'searching': False}).eq('id', user_id).execute()
        await query.message.reply_text("You've stopped searching. You can resume anytime.")
    else:
        await query.message.reply_text("Unknown callback query")

async def handle_profile_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == 'myprofile':
        user_id = update.effective_user.id
        profile = supabase.table('profiles').select('*').eq('user_id', user_id).execute()
        if profile.data:
            await query.message.reply_text(f"Here's your profile:\n\n{profile.data[0]}")
        else:
            await query.message.reply_text("You don't have a profile yet. Would you like to create one?")
    elif query.data == 'complaint':
        keyboard = [
            [InlineKeyboardButton("User Report", callback_data='user_report')],
            [InlineKeyboardButton("Bug Report", callback_data='bug_report')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.message.reply_text("What kind of complaint would you like to submit?", reply_markup=reply_markup)
    elif query.data == 'language':
        keyboard = [
            [InlineKeyboardButton("English", callback_data='lang_en')],
            [InlineKeyboardButton("Spanish", callback_data='lang_es')],
            [InlineKeyboardButton("French", callback_data='lang_fr')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.message.reply_text("Choose your preferred language:", reply_markup=reply_markup)
    else:
        await query.message.reply_text("Unknown profile callback query")
