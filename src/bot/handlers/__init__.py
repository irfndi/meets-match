"""Handlers package for the MeetMatch bot."""

from src.bot.handlers.chat import chat_callback, chat_command, message_handler
from src.bot.handlers.help import about_command, help_command
from src.bot.handlers.match import match_callback, match_command, matches_command
from src.bot.handlers.profile import (
    age_command,
    bio_command,
    gender_command,
    gender_selection,
    handle_text_message,
    interests_command,
    location_command,
    location_handler,
    name_command,
    profile_command,
    start_profile_setup,
    photo_handler,
)
from src.bot.handlers.settings import settings_callback, settings_command
from src.bot.handlers.start import start_command

__all__ = [
    # Start handler
    "start_command",
    # Profile handlers
    "profile_command",
    "name_command",
    "age_command",
    "gender_command",
    "gender_selection",
    "bio_command",
    "interests_command",
    "location_command",
    "location_handler",
    "handle_text_message",
    "start_profile_setup",
    "photo_handler",
    # Match handlers
    "match_command",
    "match_callback",
    "matches_command",
    # Chat handlers
    "chat_command",
    "chat_callback",
    "message_handler",
    # Settings handlers
    "settings_command",
    "settings_callback",
    # Help handlers
    "help_command",
    "about_command",
]
