from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes

async def show_main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("View profiles", callback_data='view_profiles')],
        [InlineKeyboardButton("My profile", callback_data='my_profile')],
        [InlineKeyboardButton("Pause matching", callback_data='pause_matching')],
        [InlineKeyboardButton("Invite friends", callback_data='invite_friends')],
        [InlineKeyboardButton("Settings", callback_data='settings')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text('Main Menu - What would you like to do?', reply_markup=reply_markup)

async def show_profile_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("Edit profile", callback_data='edit_profile')],
        [InlineKeyboardButton("Privacy settings", callback_data='privacy_settings')],
        [InlineKeyboardButton("Report an issue", callback_data='report_issue')],
        [InlineKeyboardButton("Change language", callback_data='change_language')],
        [InlineKeyboardButton("Back to main menu", callback_data='main_menu')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text('Profile Options:', reply_markup=reply_markup)

async def show_matching_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [
            InlineKeyboardButton("👍 Like", callback_data='like'),
            InlineKeyboardButton("💬 Message", callback_data='send_message'),
            InlineKeyboardButton("👎 Pass", callback_data='pass'),
            InlineKeyboardButton("⏸️ Pause", callback_data='pause_matching')
        ],
        [InlineKeyboardButton("🔍 View full profile", callback_data='view_full_profile')],
        [InlineKeyboardButton("⚠️ Report", callback_data='report_profile')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text('Profile Actions:', reply_markup=reply_markup)

async def show_match_notification(update: Update, context: ContextTypes.DEFAULT_TYPE, num_likes: int, gender: str):
    keyboard = [
        [InlineKeyboardButton("View matches", callback_data='view_matches')],
        [InlineKeyboardButton("Keep browsing", callback_data='continue_browsing')],
        [InlineKeyboardButton("Pause matching", callback_data='pause_matching')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    message = f"🎉 You have {num_likes} new {gender} match{'es' if num_likes > 1 else ''}! Would you like to view them?"
    await update.message.reply_text(message, reply_markup=reply_markup)

async def show_match_result(update: Update, context: ContextTypes.DEFAULT_TYPE, matched_user: dict):
    keyboard = [
        [InlineKeyboardButton("Start chatting 💬", callback_data=f'start_chat_{matched_user["id"]}')],
        [InlineKeyboardButton("View full profile 🔍", callback_data=f'view_profile_{matched_user["id"]}')],
        [InlineKeyboardButton("Report ⚠️", callback_data=f'report_{matched_user["id"]}')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    caption = f"You matched with {matched_user['name']}!\n\nAge: {matched_user['age']}\nLocation: {matched_user['location']}\n\nBio: {matched_user['bio']}"
    
    await update.message.reply_photo(photo=matched_user['photo'], caption=caption, reply_markup=reply_markup)

async def show_location_request(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("Share Location 📍", callback_data='share_location')],
        [InlineKeyboardButton("Not now", callback_data='skip_location')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("To see profiles near you, we need your location. Would you like to share it?", reply_markup=reply_markup)