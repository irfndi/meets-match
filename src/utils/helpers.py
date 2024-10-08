from telegram import Update
from telegram.ext import ContextTypes
from typing import Tuple, List
from database.connection import get_supabase_client
import logging

logger = logging.getLogger(__name__)

async def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Command cancelled. What would you like to do next?", parse_mode='MarkdownV2')

def validate_age_range(age_min: str, age_max: str) -> Tuple[int, int]:
    try:
        age_min = int(age_min)
        age_max = int(age_max)
        if 18 <= age_min <= age_max <= 100:
            return age_min, age_max
        else:
            raise ValueError("Invalid age range")
    except ValueError:
        raise ValueError("Invalid age input")

def parse_interests(interests_string: str) -> List[str]:
    return [interest.strip() for interest in interests_string.split(',') if interest.strip()]

async def get_user_preferences(user_id: int) -> dict:
    try:
        supabase = get_supabase_client()
        response = supabase.table('user_preferences').select('*').eq('user_id', user_id).execute()
        return response.data[0] if response.data else {}
    except Exception as e:
        logger.error(f"Error getting user preferences: {e}")
        return {}

async def update_user_preferences(user_id: int, preferences: dict):
    try:
        supabase = get_supabase_client()
        supabase.table('user_preferences').upsert({'user_id': user_id, **preferences}).execute()
    except Exception as e:
        logger.error(f"Error updating user preferences: {e}")

async def send_error_message(update: Update, context: ContextTypes.DEFAULT_TYPE, error_message: str):
    await update.message.reply_text(f"Error: {error_message}", parse_mode='MarkdownV2')

async def send_message_to_match(user_id: int, match_id: int, message: str):
    try:
        supabase = get_supabase_client()
        supabase.table('messages').insert({
            'sender_id': user_id,
            'receiver_id': match_id,
            'content': message
        }).execute()
    except Exception as e:
        logger.error(f"Error sending message to match: {e}")
