"""Logging configuration for the MeetMatch bot."""

import logging
import os
from typing import Any, Dict, Optional

import structlog
from structlog.types import Processor

from src.config import get_settings


def configure_logging() -> None:
    """Configure structured logging for the application."""
    # Load settings
    _settings = get_settings()

    # Set the log level
    log_level = getattr(logging, _settings.LOG_LEVEL.upper(), logging.INFO)

    # Define log directory and file path
    log_dir = "log"
    log_file_path = os.path.join(log_dir, "app.log")

    # Ensure log directory exists
    os.makedirs(log_dir, exist_ok=True)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers (optional, prevents duplicate logs if run multiple times)
    # for handler in root_logger.handlers[:]:
    #     root_logger.removeHandler(handler)

    # Create and add file handler
    file_handler = logging.FileHandler(log_file_path)
    # Optional: Add a formatter if needed, though structlog might handle formatting
    # formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    # file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    # Optional: Add console handler back if console output is still desired
    # console_handler = logging.StreamHandler(sys.stdout)
    # console_handler.setLevel(log_level) # Set level for console handler
    # root_logger.addHandler(console_handler)

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
    if _settings.ENVIRONMENT.lower() == "development":
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
