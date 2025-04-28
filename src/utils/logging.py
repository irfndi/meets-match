"""Logging configuration for the MeetMatch bot."""

import logging
import sys
from typing import Any, Dict, Optional

import structlog
from structlog.types import Processor

from src.config import settings


def configure_logging() -> None:
    """Configure structured logging for the application."""
    # Set the log level
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        level=log_level,
        stream=sys.stdout,
    )

    # Configure structlog processors
    processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    # Add environment-specific processors
    if settings.ENVIRONMENT.lower() == "development":
        # Pretty printing for development
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        # JSON formatting for production
        processors.append(structlog.processors.JSONRenderer())

    # Configure structlog
    structlog.configure(
        processors=processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str, **initial_values: Any) -> structlog.stdlib.BoundLogger:
    """Get a structured logger with the given name and initial values.

    Args:
        name: Logger name
        **initial_values: Initial values to bind to the logger

    Returns:
        A configured structured logger
    """
    return structlog.get_logger(name).bind(**initial_values)


def log_error(
    logger: structlog.stdlib.BoundLogger,
    error: Exception,
    message: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """Log an error with structured context.

    Args:
        logger: Structured logger
        error: Exception to log
        message: Optional message to include
        extra: Additional context to include
    """
    context = extra or {}
    context["error_type"] = error.__class__.__name__
    context["error_message"] = str(error)

    # Include error details if available
    if hasattr(error, "details"):
        context["error_details"] = error.details

    logger.error(message or "An error occurred", **context, exc_info=error)
