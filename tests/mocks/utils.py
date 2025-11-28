"""Mock utilities for testing."""

from unittest.mock import AsyncMock, MagicMock

# Mock cache functions
get_cache = MagicMock()
set_cache = MagicMock()
delete_cache = MagicMock()
get_cache_model = MagicMock()

# Mock logger
logger = MagicMock()
logger.info = MagicMock()
logger.error = MagicMock()
logger.warning = MagicMock()
logger.debug = MagicMock()
logger.exception = MagicMock()


def get_logger(name=None):
    return logger


# Mock error classes
class ValidationError(Exception):
    """Mock validation error."""

    pass


class AuthenticationError(Exception):
    """Mock authentication error."""

    pass


class NotFoundError(Exception):
    """Mock not found error."""

    pass


class ServiceError(Exception):
    """Mock service error."""

    pass


class DatabaseError(Exception):
    """Mock database error."""

    pass


class ConfigurationError(Exception):
    """Mock configuration error."""

    pass


class ExternalServiceError(Exception):
    """Mock external service error."""

    pass


class MatchingError(Exception):
    """Mock matching error."""

    pass


class MeetMatchError(Exception):
    """Mock base error."""

    pass


class RateLimitError(Exception):
    """Mock rate limit error."""

    pass
