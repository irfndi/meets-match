"""Handlers package for the MeetMatch bot."""

from src.bot.handlers.chat import chat_callback, chat_command, message_handler
from src.bot.handlers.help import about_command, help_command
from src.bot.handlers.match import match_callback, match_command, matches_command
from src.bot.handlers.profile import (
    age_command,
    bio_command,
    gender_command,
    handle_location,  # Renamed from location_handler
    # gender_selection, # Removed as it no longer exists
    interests_command,
    location_command,
    name_command,
    profile_command,
)
from src.bot.handlers.settings import settings_callback, settings_command
from src.bot.handlers.start import start_command

__all__ = [
    "about_command",
    "age_command",
    "bio_command",
    "chat_callback",
    "chat_command",
    "gender_command",
    "handle_location",
    "help_command",
    "interests_command",
    "location_command",
    "match_callback",
    "match_command",
    "matches_command",
    "message_handler",
    "name_command",
    "profile_command",
    "settings_callback",
    "settings_command",
    "start_command",
]
