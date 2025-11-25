#!/usr/bin/env python3
"""Main entry point for the MeetMatch Telegram bot."""

from src.utils.database import init_database
from src.utils.logging import get_logger
from src.bot.application import start_bot

logger = get_logger(__name__)

if __name__ == "__main__":
    logger.info("Initializing database...")
    init_database()
    logger.info("Starting bot...")
    start_bot()
