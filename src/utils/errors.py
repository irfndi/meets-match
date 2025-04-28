"""Custom exceptions for the MeetMatch bot."""

from typing import Any, Dict, Optional


class MeetMatchError(Exception):
    """Base exception for all MeetMatch errors."""

    def __init__(self, message: str, status_code: int = 500, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the error with a message and optional details.

        Args:
            message: Error message
            status_code: HTTP status code
            details: Additional error details
        """
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class ConfigurationError(MeetMatchError):
    """Raised when there's an issue with the application configuration."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the configuration error.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, 500, details)


class DatabaseError(MeetMatchError):
    """Raised when there's an issue with the database operations."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the database error.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, 500, details)


class ValidationError(MeetMatchError):
    """Raised when data validation fails."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the validation error.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, 400, details)


class AuthenticationError(MeetMatchError):
    """Raised when authentication fails."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the authentication error.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, 401, details)


class NotFoundError(MeetMatchError):
    """Raised when a requested resource is not found."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the not found error.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, 404, details)


class RateLimitError(MeetMatchError):
    """Raised when rate limiting is triggered."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the rate limit error.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, 429, details)


class ExternalServiceError(MeetMatchError):
    """Raised when an external service (Telegram, Supabase, etc.) fails."""

    def __init__(self, message: str, service: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the external service error.

        Args:
            message: Error message
            service: Name of the external service
            details: Additional error details
        """
        error_details = details or {}
        error_details["service"] = service
        super().__init__(message, 502, error_details)


class MatchingError(MeetMatchError):
    """Raised when there's an issue with the matching algorithm."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the matching error.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, 500, details)
