"""Mock utilities for testing."""

from unittest.mock import AsyncMock, MagicMock

# Mock cache functions
get_cache = AsyncMock()
set_cache = AsyncMock()
delete_cache = AsyncMock()
get_cache_model = AsyncMock()

# Mock logger
logger = MagicMock()
logger.info = MagicMock()
logger.error = MagicMock()
logger.warning = MagicMock()
logger.debug = MagicMock()
logger.exception = MagicMock()


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
