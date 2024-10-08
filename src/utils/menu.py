from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

async def show_matching_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, profile_data=None):
    keyboard = [
        [InlineKeyboardButton("Like", callback_data='like'),
         InlineKeyboardButton("Dislike", callback_data='dislike')],
        [InlineKeyboardButton("Pause Matching", callback_data='pause')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    if profile_data:
        message = f"Name: {profile_data['name']}\nAge: {profile_data['age']}\nBio: {profile_data['bio']}"
    else:
        message = "No more profiles available at the moment."
    
    if update.callback_query:
        await update.callback_query.edit_message_text(text=message, reply_markup=reply_markup)
    else:
        await update.message.reply_text(text=message, reply_markup=reply_markup)

async def show_match_notification(update: Update, context: ContextTypes.DEFAULT_TYPE, num_likes: int, gender: str):
    keyboard = [[InlineKeyboardButton("Show Match", callback_data='show_match')]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(f"You have {num_likes} new likes from {gender}!", reply_markup=reply_markup)

async def show_match_result(update: Update, context: ContextTypes.DEFAULT_TYPE, matched_user):
    keyboard = [
        [InlineKeyboardButton("Message", callback_data=f'message_{matched_user["id"]}')],
        [InlineKeyboardButton("Report", callback_data=f'report_{matched_user["id"]}')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.callback_query.edit_message_text(
        text=f"You matched with {matched_user['name']}!\nAge: {matched_user['age']}\nBio: {matched_user['bio']}",
        reply_markup=reply_markup
    )

async def show_location_request(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[InlineKeyboardButton("Share Location", callback_data='share_location')]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.callback_query.edit_message_text(
        text="Would you like to share your location to find matches nearby?",
        reply_markup=reply_markup
    )