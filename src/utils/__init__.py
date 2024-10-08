"""
Utility functions for the Telegram bot.

This module imports helper functions and defines the main menu.
It also handles database operations using Supabase.
"""

from typing import List, Dict, Any
from supabase import create_client, Client

# Import helper functions
from .helpers import (
    cancel_command,
    validate_age_range,
    parse_interests,
    get_user_preferences,
    update_user_preferences,
    send_error_message,
    send_message_to_match
)
from .validators import validate_age, validate_gender
from .keyboards import get_main_menu_keyboard, get_gender_keyboard
from config import MIN_AGE, MAX_AGE

__all__ = [
    'cancel_command',
    'validate_age_range',
    'parse_interests',
    'get_user_preferences',
    'update_user_preferences',
    'send_error_message',
    'send_message_to_match',
    'validate_age',
    'validate_gender',
    'get_main_menu_keyboard',
    'get_gender_keyboard',
    'MIN_AGE',
    'MAX_AGE'
]
