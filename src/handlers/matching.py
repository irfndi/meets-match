from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, CallbackQueryHandler, MessageHandler, filters
from utils.menu import show_matching_menu, show_match_notification, show_match_result, show_location_request
from database import get_matched_user_info, update_user_preferences, get_supabase_client
from config import TELEGRAM_BOT_TOKEN
import logging

logger = logging.getLogger(__name__)

# Define conversation states
MATCHING, LOCATION = range(2)

async def start_matching(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Starting the matching process...")
    supabase = get_supabase_client()
    user_data = supabase.table('users').select('*').eq('telegram_id', str(update.effective_user.id)).execute()
    if not user_data.data:
        await update.message.reply_text("Please set up your profile first using /profile")
        return ConversationHandler.END
    await show_matching_menu(update, context)
    return MATCHING

async def handle_matching_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    supabase = get_supabase_client()

    if query.data == 'like':
        await query.edit_message_text("You liked this profile!")
        supabase.table('likes').insert({'user_id': str(query.from_user.id), 'liked_user_id': context.user_data['current_profile_id']}).execute()
    elif query.data == 'dislike':
        await query.edit_message_text("You disliked this profile.")
        supabase.table('dislikes').insert({'user_id': str(query.from_user.id), 'disliked_user_id': context.user_data['current_profile_id']}).execute()
    elif query.data == 'pause':
        await query.edit_message_text("Matching paused. Resume anytime with /resume")
        return ConversationHandler.END

    # Show the next profile
    next_profile = supabase.rpc('get_next_profile', {'user_id': str(query.from_user.id)}).execute()
    if next_profile.data:
        context.user_data['current_profile_id'] = next_profile.data['id']
        await show_matching_menu(update, context, next_profile.data)
    else:
        await query.edit_message_text("No more profiles available. Try again later!")
        return ConversationHandler.END

    return MATCHING

async def notify_match(update: Update, context: ContextTypes.DEFAULT_TYPE):
    supabase = get_supabase_client()
    matches = supabase.rpc('get_matches', {'user_id': str(update.effective_user.id)}).execute()
    if matches.data:
        num_likes = len(matches.data)
        gender = "women" if num_likes > 1 else "woman"
        await show_match_notification(update, context, num_likes, gender)
    return MATCHING

async def handle_match_notification(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    supabase = get_supabase_client()

    if query.data == 'show_match':
        matched_user = get_matched_user_info(str(query.from_user.id))
        await show_match_result(update, context, matched_user)
    elif query.data.startswith('report_'):
        reported_user_id = query.data.split('_')[1]
        await query.edit_message_text(f"We've received your report. Our team will review it shortly.")
        supabase.table('reports').insert({'reporter_id': str(query.from_user.id), 'reported_user_id': reported_user_id}).execute()
    elif query.data == 'share_location':
        await show_location_request(update, context)
        return LOCATION

    return MATCHING

async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_location = update.message.location
    supabase = get_supabase_client()
    supabase.table('user_locations').upsert({
        'user_id': str(update.effective_user.id),
        'latitude': user_location.latitude,
        'longitude': user_location.longitude
    }).execute()
    await update.message.reply_text("Location updated successfully!")
    return MATCHING

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Matching cancelled. Use /start_matching to begin again.")
    return ConversationHandler.END

matching_handler = ConversationHandler(
    entry_points=[CommandHandler('start_matching', start_matching)],
    states={
        MATCHING: [
            CallbackQueryHandler(handle_matching_action, pattern='^(like|dislike|pause)$'),
            CommandHandler('notify_match', notify_match),
        ],
        LOCATION: [
            MessageHandler(filters.LOCATION, handle_location),
        ],
    },
    fallbacks=[CommandHandler('cancel', cancel)],
    per_message=True  # Add this line
)