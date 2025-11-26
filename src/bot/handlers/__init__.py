"""Handlers package for the MeetMatch bot."""

from src.bot.handlers.chat import chat_callback, chat_command, message_handler
from src.bot.handlers.help import about_command, help_command
from src.bot.handlers.match import match_callback, match_command, matches_command, matches_pagination_callback
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
    photo_handler,
    profile_command,
    start_profile_setup,
)
from src.bot.handlers.settings import premium_command, settings_callback, settings_command
from src.bot.handlers.start import start_command

__all__ = [
    "about_command",
    "age_command",
    "bio_command",
    "chat_callback",
    "chat_command",
    "gender_command",
    "gender_selection",
    "handle_text_message",
    "help_command",
    "interests_command",
    "location_command",
    "location_handler",
    "match_callback",
    "match_command",
    "matches_command",
    "matches_pagination_callback",
    "message_handler",
    "name_command",
    "photo_handler",
    "premium_command",
    "profile_command",
    "settings_callback",
    "settings_command",
    "start_command",
    "start_profile_setup",
]
