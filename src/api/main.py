from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.redis import RedisIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from src.bot.application import BotApplication
from src.config import settings
from src.utils.database import init_database
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Initialize Sentry if DSN is provided
if settings.SENTRY_DSN:
    logger.info("Initializing Sentry...")
    try:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=1.0 if settings.ENVIRONMENT == "development" else 0.1,
            profiles_sample_rate=1.0 if settings.ENVIRONMENT == "development" else 0.1,
            integrations=[
                FastApiIntegration(transaction_style="url"),
                SqlalchemyIntegration(),
                RedisIntegration(),
                AsyncioIntegration(),
            ],
        )
        logger.info("Sentry initialized")
    except Exception as e:
        logger.error("Failed to initialize Sentry", error=str(e))

# Global bot instance
bot_app = BotApplication()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifespan."""
    # Startup
    logger.info("Starting API and Bot...")

    # Initialize database
    try:
        init_database()
    except Exception as e:
        error_details = {}
        if hasattr(e, "details"):
            error_details = e.details
        logger.error("Failed to initialize database", error=str(e), details=error_details)
        raise

    # Start bot in background
    try:
        await bot_app.start()
    except Exception as e:
        logger.error("Failed to start bot", error=str(e))
        raise

    yield

    # Shutdown
    logger.info("Shutting down API and Bot...")
    await bot_app.stop()


app = FastAPI(
    title=settings.APP_NAME,
    description="MeetMatch API and Bot",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> JSONResponse:
    """Health check endpoint."""
    is_running = bot_app.is_running
    status_code = 200 if is_running else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if is_running else "error",
            "bot_running": is_running,
            "app": settings.APP_NAME,
            "environment": settings.ENVIRONMENT,
        },
    )


@app.get("/")
async def root() -> JSONResponse:
    """Root endpoint."""
    return JSONResponse(
        content={
            "message": "MeetMatch Bot is running",
            "docs_url": "/docs",
        }
    )
