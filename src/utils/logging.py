"""Logging configuration for the MeetMatch bot."""

import logging
import sys
from typing import Any, Dict, Optional

import structlog
from structlog.types import Processor

from src.config import settings


def configure_logging() -> None:
    """
    Configure structured logging for the application.

    Sets up the Python standard library logger to forward logs to `structlog`.
    Configures processors for context management, timestamps, exception info,
    and rendering. Use `ConsoleRenderer` for development and `JSONRenderer`
    for production.
    """
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
    """
    Get a structured logger with the given name and initial values.

    Args:
        name (str): Logger name (usually `__name__`).
        **initial_values: Key-value pairs to initially bind to the logger context.

    Returns:
        structlog.stdlib.BoundLogger: A configured structured logger instance.
    """
    return structlog.get_logger(name).bind(**initial_values)  # type: ignore


def log_error(
    logger: structlog.stdlib.BoundLogger,
    error: Exception,
    message: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Log an error with structured context.

    Automatically extracts error type, message, and traceback. If the error object
    has a `details` attribute (like custom exceptions), it includes that as well.

    Args:
        logger (structlog.stdlib.BoundLogger): The logger instance to use.
        error (Exception): The exception to log.
        message (Optional[str], optional): Custom message. Defaults to "An error occurred".
        extra (Optional[Dict[str, Any]], optional): Additional context to log.
    """
    context = extra or {}
    context["error_type"] = error.__class__.__name__
    context["error_message"] = str(error)

    # Include error details if available
    if hasattr(error, "details"):
        context["error_details"] = error.details

    logger.error(message or "An error occurred", **context, exc_info=error)
