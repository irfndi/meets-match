from telegram import Update
from telegram.ext import ContextTypes
from typing import Tuple, List
from supabase import create_client, Client

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
    response = supabase.table('user_preferences').select('*').eq('user_id', user_id).execute()
    return response.data[0] if response.data else {}

async def update_user_preferences(user_id: int, preferences: dict):
    supabase.table('user_preferences').upsert({'user_id': user_id, **preferences}).execute()

async def send_error_message(update: Update, context: ContextTypes.DEFAULT_TYPE, error_message: str):
    await update.message.reply_text(f"Error: {error_message}", parse_mode='MarkdownV2')

async def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Command cancelled\. What would you like to do next?", parse_mode='MarkdownV2')

async def send_message_to_match(user_id: int, match_id: int, message: str):
    supabase.table('messages').insert({
        'sender_id': user_id,
        'receiver_id': match_id,
        'content': message
    }).execute()
