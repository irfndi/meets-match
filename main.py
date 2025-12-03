#!/usr/bin/env python3
"""Main entry point for the MeetMatch Telegram bot."""

import uvicorn

from src.config import settings
from src.utils.logging import get_logger

logger = get_logger(__name__)

if __name__ == "__main__":
    logger.info(f"Starting MeetMatch Service on {settings.API_HOST}:{settings.API_PORT}")

    # Run the FastAPI app using Uvicorn
    # This will start the bot as part of the FastAPI lifespan
    uvicorn.run(
        "src.api.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        log_level=settings.LOG_LEVEL.lower(),
        reload=settings.DEBUG,
    )
