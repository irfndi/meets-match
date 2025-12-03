from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from src.bot.application import BotApplication
from src.config import settings
from src.utils.database import init_database
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Global bot instance
bot_app = BotApplication()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifespan."""
    # Startup
    logger.info("Starting API and Bot...")
    
    # Initialize database
    init_database()
    
    # Start bot in background
    await bot_app.start()
    
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
    return JSONResponse(
        content={
            "status": "ok",
            "app": settings.APP_NAME,
            "environment": settings.ENVIRONMENT,
        }
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
