"""
Utility functions for the Telegram bot.

This module imports helper functions and defines the main menu.
It also handles database operations using Supabase.
"""

from typing import List, Dict, Any
from supabase import create_client, Client

# Import helper functions
try:
    from .helpers import (
        validate_age_range,
        parse_interests,
        get_user_preferences,
        update_user_preferences,
        send_error_message,
        cancel_command
    )
except ImportError as e:
    print(f"Error importing from helpers: {e}")
    raise

# Initialize Supabase client
supabase_url = "YOUR_SUPABASE_URL"
supabase_key = "YOUR_SUPABASE_KEY"
supabase: Client = create_client(supabase_url, supabase_key)

def show_main_menu() -> List[Dict[str, Any]]:
    """
    Generate the main menu for the Telegram bot.
    
    Returns:
        List[Dict[str, Any]]: A list of menu items as dictionaries.
    """
    return [
        {"text": "Find Match", "callback_data": "find_match"},
        {"text": "Update Preferences", "callback_data": "update_preferences"},
        {"text": "View Profile", "callback_data": "view_profile"},
        {"text": "Help", "callback_data": "help"}
    ]

async def get_user_data(user_id: int) -> Dict[str, Any]:
    """
    Fetch user data from Supabase.
    
    Args:
        user_id (int): The Telegram user ID.
    
    Returns:
        Dict[str, Any]: User data as a dictionary.
    """
    response = await supabase.table("users").select("*").eq("telegram_id", user_id).execute()
    return response.data[0] if response.data else None

async def update_user_data(user_id: int, data: Dict[str, Any]) -> None:
    """
    Update user data in Supabase.
    
    Args:
        user_id (int): The Telegram user ID.
        data (Dict[str, Any]): The data to update.
    """
    await supabase.table("users").update(data).eq("telegram_id", user_id).execute()

__all__ = [
    'validate_age_range',
    'parse_interests',
    'get_user_preferences',
    'update_user_preferences',
    'send_error_message',
    'cancel_command',
    'show_main_menu',
    'get_user_data',
    'update_user_data'
]
