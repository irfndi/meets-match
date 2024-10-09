from telegram import Update
from telegram.ext import CommandHandler, CallbackContext
from bot.database.user_management import create_user, get_user, update_user, delete_user

def start(update: Update, context: CallbackContext):
    """Start command handler."""
    update.message.reply_text("Welcome to the Telegram Matching Bot! Use /createprofile to get started.")

def create_profile(update: Update, context: CallbackContext):
    """Create a new user profile."""
    # Example: Collect user data from the message
    username = context.args[0]
    age = int(context.args[1])
    gender = context.args[2]
    interests = context.args[3:]

    response = create_user(username, age, gender, interests)
    update.message.reply_text(f"Profile created for {username}!")

def view_profile(update: Update, context: CallbackContext):
    """View user profile."""
    user_id = context.args[0]
    user = get_user(user_id)
    if user:
        update.message.reply_text(f"Profile: {user}")
    else:
        update.message.reply_text("User not found.")

def update_profile(update: Update, context: CallbackContext):
    """Update user profile."""
    user_id = context.args[0]
    updates = {
        'age': int(context.args[1]),
        'gender': context.args[2],
        'interests': context.args[3:]
    }
    response = update_user(user_id, updates)
    update.message.reply_text("Profile updated!")

def delete_profile(update: Update, context: CallbackContext):
    """Delete user profile."""
    user_id = context.args[0]
    response = delete_user(user_id)
    update.message.reply_text("Profile deleted!")