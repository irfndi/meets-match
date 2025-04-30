"""Utils package for the MeetMatch bot."""

from src.utils.errors import (
    AuthenticationError,
    ConfigurationError,
    DatabaseError,
    ExternalServiceError,
    MatchingError,
    MeetMatchError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)
from src.utils.logging import configure_logging, get_logger, log_error

__all__ = [
    # Error classes
    "AuthenticationError",
    "ConfigurationError",
    "DatabaseError",
    "ExternalServiceError",
    "MatchingError",
    "MeetMatchError",
    "NotFoundError",
    "RateLimitError",
    "ValidationError",
    # Logging utilities
    "configure_logging",
    "get_logger",
    "log_error",
]
