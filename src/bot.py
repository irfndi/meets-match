import asyncio
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardRemove, InputMediaPhoto, InputMediaVideo
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes, JobQueue
from telegram.error import NetworkError, RetryAfter
from telegram.constants import ParseMode, FileSizeLimit  # Import ParseMode from constants
from loguru import logger
from datetime import datetime, timedelta
import traceback
import html
import json
import sys
from postgrest import APIError  # Add this import
from uuid import UUID
from dataclasses import fields
import time
import os
import aiohttp
from io import BytesIO
try:
    import aiofiles
except ImportError:
    aiofiles = None
    print("Warning: aiofiles module not found. Some file operations may not work as expected.")

# Import configuration and database operations
try:
    from config import TELEGRAM_BOT_TOKEN, supabase_client, USERS_TABLE, MAX_REQUESTS_PER_MINUTE, LOG_LEVEL, SUPABASE_URL, MEDIA_CACHE_DIR
    from database.db_operations import get_or_create_user, update_user, setup_database, upload_file_to_bucket, verify_and_update_media, get_cached_media_url
    from database.initialization import setup as db_setup
    from database.schema import User
except ImportError as e:
    logger.error(f"Failed to import required modules: {str(e)}")
    logger.error("Please check your configuration and ensure all required modules are installed.")
    logger.error(traceback.format_exc())
    sys.exit(1)
except ValueError as e:
    logger.error(f"Configuration error: {str(e)}")
    logger.error("Please check your .env file and ensure all required variables are set correctly.")
    sys.exit(1)

# Add this helper function
def is_profile_complete(user: User) -> bool:
    required_fields = ['age', 'gender', 'looking_for', 'city', 'name', 'bio', 'media']
    is_complete = all(getattr(user, field) not in [None, '', []] for field in required_fields)
    logger.info(f"Profile completeness check for {user.username}: {is_complete}")
    return is_complete

# Move help_command function here
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    help_text = (
        "Here are the available commands:\n"
        "/start - Start the bot\n"
        "/menu - Show the main menu\n"
        "/createprofile - Create a new profile\n"
        "/myprofile - View your profile\n"
        "If you need further assistance, please contact our support."
    )
    await update.message.reply_text(help_text)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        logger.info(f"Start command initiated by user: {update.effective_user.username}")
        user = await get_or_create_user(update.effective_user.username)
        logger.info(f"User data retrieved or created: {user}")

        if not is_profile_complete(user):
            await continue_profile_creation(update, context, user)
        else:
            await greet_existing_user(update, context, user)
    except Exception as e:
        logger.error(f"Error in start command: {str(e)}")
        logger.error(traceback.format_exc())
        await update.message.reply_text("Oops! Something went wrong. Please try again later or contact support.")

async def request_media_upload(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User):
    await update.message.reply_text(
        "To get started, please upload at least one photo or video to complete your profile. "
        "You can upload up to 3 media items in total."
    )
    context.user_data['awaiting_media'] = True

async def handle_media_upload(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await get_or_create_user(update.effective_user.username)
    
    if not hasattr(user, 'media') or user.media is None:
        user.media = []

    if len(user.media) >= 3:
        await update.message.reply_text("You've already uploaded the maximum of 3 media items. Please delete one before adding a new one.")
        await show_current_media(update, context, user)
        return

    file = await (update.message.photo[-1] if update.message.photo else update.message.video).get_file()
    
    if file.file_size > 20 * 1024 * 1024:  # 20 MB limit
        await update.message.reply_text("The file is too large. Please upload a file smaller than 20 MB.")
        return

    file_extension = 'jpg' if update.message.photo else 'mp4'
    file_name = f"user_{user.username}_media_{len(user.media)}_{int(time.time())}.{file_extension}"
    
    try:
        public_url = await upload_file_to_bucket(file, file_name, "user-media")
        media_type = 'photo' if update.message.photo else 'video'
        new_media_item = {'type': media_type, 'url': public_url}
        
        user.media.append(new_media_item)
        
        success = await update_user(user)
        if success:
            await update.message.reply_text("Media uploaded successfully!")
            if len(user.media) < 3:
                keyboard = [
                    [InlineKeyboardButton("Upload more", callback_data='upload_more_media')],
                    [InlineKeyboardButton("Done", callback_data='media_upload_done')]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                await update.message.reply_text(
                    f"You've uploaded {len(user.media)} media item(s). "
                    "You can upload up to 3 items. What would you like to do?",
                    reply_markup=reply_markup
                )
            else:
                await update.message.reply_text("You've uploaded the maximum number of media items.")
            await edit_profile(update, context)
        else:
            await update.message.reply_text("There was an error updating your profile. Please try again later.")
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        await update.message.reply_text("There was an error uploading your media. Please try again.")

async def handle_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = context.user_data.get('user')
    if not user:
        user = await get_or_create_user(update.effective_user.username)
        context.user_data['user'] = user

    if not user.media:
        await update.message.reply_text("You need to upload at least one media item before completing your profile.")
        await request_media_upload(update, context, user)
    elif is_profile_complete(user):
        await finalize_profile(update, context, user)
    else:
        await continue_profile_creation(update, context, user)

async def continue_profile_creation(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User):
    if not user.media:
        await request_media_upload(update, context, user)
        return

    missing_fields = [field for field in ['age', 'gender', 'looking_for', 'city', 'name', 'bio'] if getattr(user, field) is None]
    
    if missing_fields:
        field = missing_fields[0]
        context.user_data['awaiting_input'] = field
        await update.message.reply_text(f"Please enter your {field}:")
    else:
        await finalize_profile(update, context, user)

async def greet_existing_user(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User):
    if not user.media:
        await request_media_upload(update, context, user)
        return

    await show_profile(update, context, user)

async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await get_or_create_user(update.effective_user.username)
    if not user.media:
        await request_media_upload(update, context, user)
        return

    keyboard = [
        [KeyboardButton("👀 Start"), KeyboardButton("👤 Profile")],
        [KeyboardButton("⚙️ Settings"), KeyboardButton("❓ Help")]
    ]
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    await update.message.reply_text("What would you like to do?", reply_markup=reply_markup)
    
    # Check if it's time to review the profile
    if datetime.utcnow() - user.last_profile_check > timedelta(days=30):
        await ask_profile_review(update, context, user)

async def ask_profile_review(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User):
    keyboard = [
        [InlineKeyboardButton("Review Profile", callback_data='review_profile')],
        [InlineKeyboardButton("I'm good", callback_data='skip_review')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("It's been a while since you last checked your profile. Would you like to review it?", reply_markup=reply_markup)

async def lets_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    safety_message = (
        "⚠️ Safety First: Protect Yourself Online\n\n"
        "Remember, people online may not always be who they claim to be. "
        "Our bot prioritizes your privacy and doesn't collect personal data "
        "or require official identification.\n\n"
        "By continuing, you agree to our user agreement and privacy policy."
    )
    
    keyboard = [[InlineKeyboardButton("I understand", callback_data='accept_terms')]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(safety_message, reply_markup=reply_markup)

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == 'accept_terms':
        keyboard = [
            [InlineKeyboardButton("1. Browse Profiles 🔍", callback_data='view_profiles')],
            [InlineKeyboardButton("2. My Profile 👤", callback_data='my_profile')],
            [InlineKeyboardButton("3. Pause Matching 🚫", callback_data='stop_searching')],
            [InlineKeyboardButton("4. Invite Friends 😎", callback_data='invite_friends')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text("Great! What would you like to do?", reply_markup=reply_markup)
    elif query.data == 'view_profiles':
        await query.edit_message_text("Coming soon: Discover and connect with amazing people!")
    elif query.data == 'my_profile':
        user = await get_or_create_user(update.effective_user.username)
        if user:
            await show_profile(update, context, user)
        else:
            await query.edit_message_text("Oops! Something went wrong. Please try creating your profile first.")
    elif query.data == 'stop_searching':
        await query.edit_message_text("Coming soon: Take a break from the dating scene.")
    elif query.data == 'invite_friends':
        await query.edit_message_text("Coming soon: Invite friends and boost your matches!")
    elif query.data == 'profile_correct':
        await query.edit_message_text("Great! Your profile is all set. Start browsing matches now!")
    elif query.data == 'edit_profile':
        await edit_profile(update, context)
    elif query.data == 'back_to_menu':
        await menu(update, context)
    elif query.data.startswith('lang_'):
        await handle_language_selection(update, context)
    elif query.data == 'review_profile':
        await show_profile(update, context, await get_or_create_user(update.effective_user.username))
    elif query.data == 'skip_review':
        user = await get_or_create_user(update.effective_user.username)
        user.last_profile_check = datetime.utcnow()
        await update_user(user)
        await query.edit_message_text("No problem! We'll remind you again in a month.")
    elif query.data == 'change_language':
        await my_profile(update, context)
    elif query.data == 'notification_settings':
        await query.edit_message_text("Notification settings coming soon!")
    elif query.data == 'start_matching':
        await lets_start(update, context)
    elif query.data == 'update_profile':
        await edit_profile(update, context)
    elif query.data == 'view_profile':
        user = await get_or_create_user(update.effective_user.username)
        await show_profile(update, context, user)
    elif query.data.startswith('edit_') or query.data.startswith('set_') or query.data.startswith('keep_') or query.data.startswith('enter_'):
        await handle_edit_profile(update, context)
    else:
        await query.edit_message_text(f"Unknown button: {query.data}")

async def my_profile(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🇬 English", callback_data='lang_english')],
        # Add more language options here
        # [InlineKeyboardButton("🇪🇸 Espaol", callback_data='lang_spanish')],
        # [InlineKeyboardButton("🇫🇷 Français", callback_data='lang_french')],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Choose your preferred language 👇", reply_markup=reply_markup)

async def handle_language_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data.startswith('lang_'):
        language = query.data.split('_')[1]
        user = await get_or_create_user(update.effective_user.username)
        if user:
            user.language = language
            user.last_profile_check = datetime.utcnow()  # Reset the profile check timer
            await update_user(user)
            await query.edit_message_text(f"Great! Your language has been set to {language.capitalize()}.")
            await show_profile(update, context, user)
        else:
            await query.edit_message_text("Oops! Something went wrong. Please try creating your profile first.")

async def show_profile(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User = None) -> None:
    if not user:
        user = await get_or_create_user(update.effective_user.username)
    else:
        # Refresh user data to ensure we have the latest information
        user = await get_or_create_user(user.username)
    
    if not user.media:
        await update.effective_message.reply_text("You need to add at least one photo or video to your profile before you can use this feature. Use /edit_profile to add media.")
        return

    # Send media first
    for media_item in user.media:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(media_item['url']) as response:
                    if response.status == 200:
                        content = await response.read()
                        if media_item['type'] == 'photo':
                            await update.effective_message.reply_photo(BytesIO(content))
                        elif media_item['type'] == 'video':
                            await update.effective_message.reply_video(BytesIO(content))
                    else:
                        logger.error(f"Failed to fetch media: {media_item['url']}")
        except Exception as e:
            logger.error(f"Error sending media item: {media_item}. Error: {str(e)}")
            await update.effective_message.reply_text("Sorry, there was an error displaying one of your media items. We're working on fixing it.")

    # Then send the profile text
    profile_text = (
        f"Welcome back, {user.name}! 👋\n\n"
        f"Age: {user.age}\n"
        f"Gender: {user.gender}\n"
        f"Looking for: {user.looking_for}\n"
        f"City: {user.city}\n\n"
        f"Bio: {user.bio}\n\n"
        "What would you like to do?"
    )
    
    # Add buttons for further actions
    keyboard = [
        [InlineKeyboardButton("Start Matching 🔍", callback_data='start_matching')],
        [InlineKeyboardButton("Update Profile ✏️", callback_data='update_profile')],
        [InlineKeyboardButton("View Profile 👤", callback_data='view_profile')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.effective_message.reply_text(profile_text, reply_markup=reply_markup)

    # Log the user's media for debugging
    logger.info(f"User {user.username} media: {user.media}")

async def report_complain(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("We're here to help! What would you like to report or discuss?")

async def start_profile_creation(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Welcome to the Matching Bot! Let's create your profile.")
    await update.message.reply_text("What's your age?")
    context.user_data['profile_creation'] = {'step': 'age'}

async def handle_profile_creation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = context.user_data.get('user')
    if not user:
        user = await get_or_create_user(update.effective_user.username)
        context.user_data['user'] = user

    # Handle media upload
    if update.message.photo or update.message.video:
        await handle_media_upload(update, context, user)
    elif context.user_data.get('awaiting_input'):
        await handle_text_input(update, context, user)
    else:
        await continue_profile_creation(update, context, user)

async def handle_text_input(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User):
    field = context.user_data.get('awaiting_input')
    if not field:
        await continue_profile_creation(update, context, user)
        return

    value = update.message.text
    setattr(user, field, value)
    
    success = await update_user(user)
    if success:
        await update.message.reply_text(f"Your {field} has been updated.")
        context.user_data['awaiting_input'] = None
        if user.is_complete():
            await finalize_profile(update, context, user)
        else:
            await continue_profile_creation(update, context, user)
    else:
        await update.message.reply_text("There was an error updating your profile. Please try again.")

async def finalize_profile(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User):
    user.profile_completed = True
    success = await update_user(user)
    if success:
        await update.message.reply_text("Great! Your profile is now complete.")
        await show_profile(update, context, user)
    else:
        await update.message.reply_text("There was an error finalizing your profile. Please try again later.")

async def settings(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("Change Language", callback_data='change_language')],
        [InlineKeyboardButton("Notification Settings", callback_data='notification_settings')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("What would you like to change?", reply_markup=reply_markup)

async def update_profile(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await get_or_create_user(update.effective_user.username)
    if user:
        keyboard = [
            [InlineKeyboardButton(f"Age: {user.age}", callback_data='update_age')],
            [InlineKeyboardButton(f"Gender: {user.gender}", callback_data='update_gender')],
            [InlineKeyboardButton(f"Looking for: {user.looking_for}", callback_data='update_looking_for')],
            [InlineKeyboardButton(f"City: {user.city}", callback_data='update_city')],
            [InlineKeyboardButton("Update Bio", callback_data='update_bio')],
            [InlineKeyboardButton("Update Photos/Video", callback_data='update_media')],
            [InlineKeyboardButton("Done", callback_data='update_done')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.effective_message.reply_text("What would you like to update?", reply_markup=reply_markup)
    else:
        await update.effective_message.reply_text("Oops! Something went wrong. Please try creating your profile first.")

async def handle_profile_update(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    user = await get_or_create_user(update.effective_user.username)
    if not user:
        await query.edit_message_text("Oops! Something went wrong. Please try creating your profile first.")
        return

    if query.data == 'update_age':
        await query.edit_message_text("Please enter your new age:")
        context.user_data['profile_update'] = {'field': 'age'}
    elif query.data == 'update_gender':
        keyboard = [
            [InlineKeyboardButton("Male", callback_data='set_gender_male')],
            [InlineKeyboardButton("Female", callback_data='set_gender_female')],
            [InlineKeyboardButton("Other", callback_data='set_gender_other')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text("Please select your gender:", reply_markup=reply_markup)
    elif query.data == 'update_looking_for':
        keyboard = [
            [InlineKeyboardButton("Men", callback_data='set_looking_for_men')],
            [InlineKeyboardButton("Women", callback_data='set_looking_for_women')],
            [InlineKeyboardButton("Both", callback_data='set_looking_for_both')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text("Who are you looking for?", reply_markup=reply_markup)
    elif query.data == 'update_city':
        await query.edit_message_text("Please enter your new city:")
        context.user_data['profile_update'] = {'field': 'city'}
    elif query.data == 'update_bio':
        await query.edit_message_text("Please enter your new bio:")
        context.user_data['profile_update'] = {'field': 'bio'}
    elif query.data == 'update_media':
        await query.edit_message_text("Please send new photos (up to 3) or a video (up to 1). Send 'done' when finished.")
        context.user_data['profile_update'] = {'field': 'media'}
    elif query.data == 'update_done':
        await query.edit_message_text("Profile update completed!")
        await show_profile(update, context, user)
    elif query.data.startswith('set_gender_'):
        gender = query.data.split('_')[-1]
        user.gender = gender.capitalize()
        await update_user(user)
        await query.edit_message_text(f"Your gender has been updated to {user.gender}.")
        await update_profile(update, context)
    elif query.data.startswith('set_looking_for_'):
        looking_for = query.data.split('_')[-1]
        user.looking_for = looking_for.capitalize()
        await update_user(user)
        await query.edit_message_text(f"Your preference has been updated to {user.looking_for}.")
        await update_profile(update, context)

async def handle_profile_update_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await get_or_create_user(update.effective_user.username)
    edit_field = context.user_data.get('edit_field')

    try:
        if edit_field == 'age':
            try:
                age = int(update.message.text)
                if 18 <= age <= 100:
                    user.age = age
                    await update_user(user)
                    await update.message.reply_text(f"Your age has been updated to {age}.")
                    # Show the updated profile
                    await show_profile(update, context, user)
                else:
                    await update.message.reply_text("Please enter a valid age between 18 and 100.")
                    return
            except ValueError:
                await update.message.reply_text("Please enter a valid number for your age.")
                return
        elif edit_field == 'city':
            user.city = update.message.text
            await update_user(user)
            await update.message.reply_text(f"Your city has been updated to {user.city}.")
            await show_profile(update, context, user)
        elif edit_field == 'location':
            if update.message.location:
                # Here you would typically use a geocoding service to get the city name from coordinates
                # For this example, we'll just use the coordinates
                user.city = f"Lat: {update.message.location.latitude}, Lon: {update.message.location.longitude}"
                await update_user(user)
                await update.message.reply_text(f"Your location has been updated to {user.city}.")
                await show_profile(update, context, user)
            else:
                await update.message.reply_text("Please share your location or use the 'Enter new city' option.")
                return
        elif edit_field == 'bio':
            user.bio = update.message.text
            await update_user(user)
            await update.message.reply_text("Your bio has been updated.")
            await show_profile(update, context, user)
        elif edit_field == 'media':
            if update.message.photo or update.message.video:
                await handle_media_upload(update, context)
            else:
                await update.message.reply_text("Please send a photo or video.")
                return
        else:
            await update.message.reply_text("I'm not sure what you're trying to update. Please use the edit profile menu.")
            await edit_profile(update, context)
            return

        # Clear the edit_field from user_data
        if 'edit_field' in context.user_data:
            del context.user_data['edit_field']

        # Reset the timeout timer
        current_jobs = context.job_queue.get_jobs_by_name(f'cancel_edit_{update.effective_user.id}')
        for job in current_jobs:
            job.schedule_removal()
        context.job_queue.run_once(cancel_edit, 120, data={'chat_id': update.effective_chat.id}, name=f'cancel_edit_{update.effective_user.id}')
    except Exception as e:
        logger.error(f"Error in handle_profile_update_input: {str(e)}")
        await update.message.reply_text("An error occurred while processing your request. Please try again.")

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Log the error and send a telegram message to notify the developer."""
    logger.error("Exception while handling an update:", exc_info=context.error)

    tb_list = traceback.format_exception(None, context.error, context.error.__traceback__)
    tb_string = ''.join(tb_list)

    message = (
        f"An exception was raised while handling an update\n"
        f"<pre>update = {html.escape(json.dumps(update.to_dict(), indent=2, ensure_ascii=False))}"
        "</pre>\n\n"
        f"<pre>context.chat_data = {html.escape(str(context.chat_data))}</pre>\n\n"
        f"<pre>context.user_data = {html.escape(str(context.user_data))}</pre>\n\n"
        f"<pre>{html.escape(tb_string)}</pre>"
    )

    # Send error message to user
    user_message = "Sorry, something went wrong while processing your request. Please try again later."
    if isinstance(context.error, APIError):
        if context.error.code == '23505':
            user_message = "It looks like you already have a profile. Let's update it instead."
    
    await context.bot.send_message(
        chat_id=update.effective_chat.id, 
        text=user_message,
        parse_mode=ParseMode.HTML
    )
    
    # Log the error message
    logger.error(message)

async def run_bot():
    if not TELEGRAM_BOT_TOKEN:
        logger.error("Telegram bot token is not set. Please check your .env file.")
        return

    try:
        logger.info(f"Initializing bot with token: {TELEGRAM_BOT_TOKEN[:8]}...")
        application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
        
        # Command handlers
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CommandHandler("menu", menu))
        application.add_handler(CommandHandler("createprofile", start_profile_creation))
        application.add_handler(CommandHandler("myprofile", my_profile))
        application.add_handler(CommandHandler("done", handle_done))
        application.add_handler(CommandHandler("edit_profile", edit_profile))
        application.add_handler(CommandHandler("help", help_command))
        
        # Message handlers
        application.add_handler(MessageHandler(filters.Regex(r'^👀 Start$'), lets_start))
        application.add_handler(MessageHandler(filters.Regex(r'^👤 Profile$'), my_profile))
        application.add_handler(MessageHandler(filters.Regex(r'^⚙️ Settings$'), settings))
        application.add_handler(MessageHandler(filters.Regex(r'^❓ Help$'), help_command))
        application.add_handler(MessageHandler(filters.Regex(r'^Report/Complain$'), report_complain))
        
        # Callback query handler
        application.add_handler(CallbackQueryHandler(handle_button))
        
        # Profile creation and update handlers
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_profile_creation))
        application.add_handler(MessageHandler(filters.PHOTO | filters.VIDEO, handle_profile_creation))
        application.add_handler(CallbackQueryHandler(handle_profile_update, pattern='^update_|^set_'))
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_profile_update_input))
        application.add_handler(MessageHandler(filters.PHOTO | filters.VIDEO, handle_profile_update_input))
        
        # Edit profile handler
        application.add_handler(CallbackQueryHandler(handle_edit_profile, pattern='^edit_|^set_|^keep_|^enter_|^upload_|^back_'))
        
        # Error handler
        application.add_error_handler(error_handler)
        
        # Set up rate limiting
        try:
            await application.bot.set_my_commands(commands=[
                ("start", "Start the bot"),
                ("menu", "Show the main menu"),
                ("createprofile", "Create a new profile"),
                ("myprofile", "View your profile"),
                ("edit_profile", "Edit your profile"),
                ("help", "Get help")
            ])
        except Exception as e:
            logger.error(f"Failed to set bot commands: {str(e)}")
        
        await application.initialize()
        await application.start()
        await application.updater.start_polling(allowed_updates=Update.ALL_TYPES)

        logger.info("Bot is running. Press Ctrl-C to stop.")
        
        # Keep the bot running until interrupted
        stop_signal = asyncio.Future()
        await stop_signal
        
    except Exception as e:
        logger.error(f"Error running bot: {str(e)}")
        logger.error(traceback.format_exc())
    finally:
        logger.info("Stopping the bot...")
        if 'application' in locals():
            try:
                await application.stop()
                await application.shutdown()
            except Exception as e:
                logger.error(f"Error stopping the bot: {str(e)}")
        logger.info("Bot stopped successfully.")

async def main():
    try:
        # Set up the database
        db_setup_success = await setup_database(supabase_client)
        if not db_setup_success:
            logger.error("Database setup failed. Exiting the application.")
            return

        await db_setup()  # Run database setup and migrations
        await run_bot()
    except Exception as e:
        logger.error(f"Critical error in main function: {str(e)}")
        logger.error(traceback.format_exc())
        logger.error("The bot will now shut down.")
    finally:
        # Perform any necessary cleanup here
        pass

async def edit_profile(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await get_or_create_user(update.effective_user.username)
    
    keyboard = [
        [InlineKeyboardButton(f"Age: {user.age}", callback_data='edit_age')],
        [InlineKeyboardButton(f"Gender: {user.gender}", callback_data='edit_gender')],
        [InlineKeyboardButton(f"Looking for: {user.looking_for}", callback_data='edit_looking_for')],
        [InlineKeyboardButton(f"City: {user.city}", callback_data='edit_location')],
        [InlineKeyboardButton("Edit Bio", callback_data='edit_bio')],
        [InlineKeyboardButton("Update Photos/Video", callback_data='edit_media')],
        [InlineKeyboardButton("Done", callback_data='edit_done')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    message = "What would you like to edit?"
    if update.callback_query:
        await update.callback_query.edit_message_text(message, reply_markup=reply_markup)
    else:
        await update.message.reply_text(message, reply_markup=reply_markup)

    # Remove existing job if any
    current_jobs = context.job_queue.get_jobs_by_name(f'cancel_edit_{update.effective_user.id}')
    for job in current_jobs:
        job.schedule_removal()
    # Set a 2-minute timeout for the edit session
    context.job_queue.run_once(cancel_edit, 120, data={'chat_id': update.effective_chat.id}, name=f'cancel_edit_{update.effective_user.id}')

async def handle_edit_profile(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user = await get_or_create_user(query.from_user.username)
    
    try:
        if query.data == 'edit_age':
            keyboard = [
                [InlineKeyboardButton(f"Keep current age: {user.age}", callback_data='keep_age')],
                [InlineKeyboardButton("Enter new age", callback_data='enter_new_age')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text("Do you want to keep your current age or enter a new one?", reply_markup=reply_markup)
        elif query.data == 'keep_age':
            await query.edit_message_text(f"Your age remains {user.age}.")
            await edit_profile(update, context)
        elif query.data == 'enter_new_age':
            await query.edit_message_text("Please enter your new age:")
            context.user_data['edit_field'] = 'age'
        elif query.data == 'edit_gender':
            keyboard = [
                [InlineKeyboardButton("Male", callback_data='set_gender_male')],
                [InlineKeyboardButton("Female", callback_data='set_gender_female')],
                [InlineKeyboardButton("Other", callback_data='set_gender_other')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text("Please select your gender:", reply_markup=reply_markup)
        elif query.data.startswith('set_gender_'):
            gender = query.data.split('_')[-1].capitalize()
            user.gender = gender
            await update_user(user)
            await query.edit_message_text(f"Your gender has been updated to {gender}.")
            await edit_profile(update, context)
        elif query.data == 'edit_looking_for':
            keyboard = [
                [InlineKeyboardButton("Men", callback_data='set_looking_for_men')],
                [InlineKeyboardButton("Women", callback_data='set_looking_for_women')],
                [InlineKeyboardButton("Both", callback_data='set_looking_for_both')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text("Who are you looking for?", reply_markup=reply_markup)
        elif query.data.startswith('set_looking_for_'):
            looking_for = query.data.split('_')[-1].capitalize()
            user.looking_for = looking_for
            await update_user(user)
            await query.edit_message_text(f"Your preference has been updated to {looking_for}.")
            await edit_profile(update, context)
        elif query.data == 'edit_location':
            keyboard = [
                [InlineKeyboardButton(f"Keep current city: {user.city}", callback_data='keep_city')],
                [InlineKeyboardButton("Enter new city", callback_data='enter_new_city')],
                [InlineKeyboardButton("Share my location", callback_data='share_location')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text("Do you want to keep your current city, enter a new one, or share your location?", reply_markup=reply_markup)
        elif query.data == 'keep_city':
            await query.edit_message_text(f"Your city remains {user.city}.")
            await edit_profile(update, context)
        elif query.data == 'enter_new_city':
            await query.edit_message_text("Please enter your new city:")
            context.user_data['edit_field'] = 'city'
        elif query.data == 'share_location':
            await query.edit_message_text("Please share your location.")
            context.user_data['edit_field'] = 'location'
        elif query.data == 'edit_bio':
            keyboard = [
                [InlineKeyboardButton("Keep current bio", callback_data='keep_bio')],
                [InlineKeyboardButton("Enter new bio", callback_data='enter_new_bio')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            current_bio = user.bio if user.bio else "No bio set"
            await query.edit_message_text(f"Current bio: {current_bio}\n\nDo you want to keep your current bio or enter a new one?", reply_markup=reply_markup)
        elif query.data == 'keep_bio':
            await query.edit_message_text("Your bio remains unchanged.")
            await edit_profile(update, context)
        elif query.data == 'enter_new_bio':
            await query.edit_message_text("Please enter your new bio:")
            context.user_data['edit_field'] = 'bio'
        elif query.data == 'edit_media':
            await show_current_media(update, context, user)
        elif query.data == 'edit_done':
            await show_profile(update, context, user)

        # Reset the timeout timer
        current_jobs = context.job_queue.get_jobs_by_name(f'cancel_edit_{update.effective_user.id}')
        for job in current_jobs:
            job.schedule_removal()
        context.job_queue.run_once(cancel_edit, 120, data={'chat_id': update.effective_chat.id}, name=f'cancel_edit_{update.effective_user.id}')
    except Exception as e:
        logger.error(f"Error in handle_edit_profile: {str(e)}")
        await query.edit_message_text("An error occurred while processing your request. Please try again.")

async def show_current_media(update: Update, context: ContextTypes.DEFAULT_TYPE, user: User):
    if not user.media:
        await update.callback_query.edit_message_text("You don't have any media yet. Please upload a photo or video.")
        context.user_data['edit_field'] = 'media'
        return

    media_message = "Your current media:\n"
    for i, media_item in enumerate(user.media, 1):
        media_message += f"{i}. {media_item['type'].capitalize()}\n"

    keyboard = [
        [InlineKeyboardButton("Upload new media", callback_data='upload_new_media')],
        [InlineKeyboardButton("Back to edit menu", callback_data='back_to_edit_menu')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.callback_query.edit_message_text(media_message, reply_markup=reply_markup)

async def cancel_edit(context: ContextTypes.DEFAULT_TYPE):
    job = context.job
    chat_id = job.data['chat_id']
    await context.bot.send_message(chat_id=chat_id, text="Edit profile session timed out. Please start again if you want to make changes.")
    if 'edit_field' in context.user_data:
        del context.user_data['edit_field']
    # The job will be automatically removed after execution, so we don't need to remove it manually

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user.")
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.error(traceback.format_exc())