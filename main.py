#!/usr/bin/env python3
"""Main entry point for the MeetMatch Telegram bot.

This script runs the FastAPI application using Uvicorn, which in turn manages
the lifecycle of the Telegram bot. It uses configuration settings defined in
`src.config` to determine the host, port, log level, and reload status.

Environment Variables:
    API_HOST (str): The host to bind the server to.
    API_PORT (int): The port to bind the server to.
    LOG_LEVEL (str): The logging level (e.g., 'INFO', 'DEBUG').
    DEBUG (bool): Whether to enable auto-reload for development.
"""

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
