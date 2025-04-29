"""Utils package for the MeetMatch bot."""

from src.utils.cache import delete_cache, get_cache, get_cache_model, set_cache
from src.utils.database import execute_query
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
    # Cache utilities
    "delete_cache",
    "get_cache",
    "get_cache_model",
    "set_cache",
    # Database utilities
    "execute_query",
    # Error classes
    "MeetMatchError",
    "ConfigurationError",
    "DatabaseError",
    "ValidationError",
    "AuthenticationError",
    "NotFoundError",
    "RateLimitError",
    "ExternalServiceError",
    "MatchingError",
    # Logging utilities
    "configure_logging",
    "get_logger",
    "log_error",
]
