import os
from supabase import create_client, Client
from telegram import Update
from telegram.ext import ContextTypes
from .connection import get_supabase_client
from .schema import User, Profile
from typing import List
import logging

logger = logging.getLogger(__name__)

async def match_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    supabase = get_supabase_client()
    
    # Fetch user preferences from Supabase
    response = supabase.table("user_preferences").select("*").eq("user_id", str(user.id)).execute()
    preferences = response.data[0] if response.data else None
    
    if not preferences:
        await update.message.reply_text("Please set your preferences first.")
        return
    
    # Query Supabase for potential matches
    query = supabase.table("user_preferences").select("*").neq("user_id", str(user.id)).execute()
    potential_matches = query.data
    
    # Simple matching algorithm (you can improve this based on your needs)
    matches = [
        match for match in potential_matches
        if match['interests'] == preferences['interests'] or match['hobbies'] == preferences['hobbies']
    ]
    
    if not matches:
        await update.message.reply_text("No matches found at the moment. Try again later!")
    else:
        match_text = "Here are your potential matches:\n\n"
        for match in matches[:5]:  # Limit to top 5 matches
            match_text += f"- {match['name']} (Interests: {match['interests']}, Hobbies: {match['hobbies']})\n"
        await update.message.reply_text(match_text)

async def set_preferences(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    supabase = get_supabase_client()
    
    # Parse user input (assuming format: "interests: X, Y, Z; hobbies: A, B, C")
    preferences = update.message.text.split(';')
    interests = preferences[0].split(':')[1].strip()
    hobbies = preferences[1].split(':')[1].strip()
    
    # Store preferences in Supabase
    supabase.table("user_preferences").upsert({
        "user_id": str(user.id),
        "name": user.full_name,
        "interests": interests,
        "hobbies": hobbies
    }).execute()
    
    await update.message.reply_text("Your preferences have been updated!")

def find_matches(user_id: str, limit: int = 10) -> List[User]:
    supabase = get_supabase_client()
    try:
        # Get the user's profile
        user_profile = supabase.table('profiles').select('*').eq('user_id', user_id).single().execute()
        if not user_profile.data:
            raise Exception(f"User profile not found for user_id: {user_id}")
        
        user_profile = user_profile.data

        # Find potential matches based on preferences
        matches_query = supabase.table('profiles').select('*')
        
        # Add filters based on user preferences
        if user_profile.get('gender_preference'):
            matches_query = matches_query.eq('gender', user_profile['gender_preference'])
        
        matches = matches_query.neq('user_id', user_id).limit(limit).execute()

        if not matches.data:
            return []

        # Fetch full user data for matches
        user_ids = [match['user_id'] for match in matches.data]
        users = supabase.table('users').select('*').in_('id', user_ids).execute()

        return [User(**user) for user in users.data]
    except Exception as e:
        logger.error(f"Error in find_matches: {str(e)}")
        return []

def set_preferences(user_id: str, preferences: dict) -> bool:
    supabase = get_supabase_client()
    try:
        result = supabase.table('preferences').upsert({
            "user_id": user_id,
            **preferences
        }).execute()
        return True
    except Exception as e:
        logger.error(f"Error in set_preferences: {str(e)}")
        return False