"""Custom exceptions for the MeetMatch bot."""

from typing import Any, Dict, Optional


class MeetMatchError(Exception):
    """Base exception for all MeetMatch errors."""

    def __init__(self, message: str, status_code: int = 500, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the error with a message and optional details.

        Args:
            message (str): Error message describing what went wrong.
            status_code (int): HTTP status code associated with the error (default 500).
            details (Optional[Dict[str, Any]]): Additional context or debug information.
        """
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class ConfigurationError(MeetMatchError):
    """Raised when there's an issue with the application configuration."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the configuration error.

        Args:
            message (str): Error message.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        super().__init__(message, 500, details)


class DatabaseError(MeetMatchError):
    """Raised when there's an issue with the database operations."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the database error.

        Args:
            message (str): Error message.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        super().__init__(message, 500, details)


class ValidationError(MeetMatchError):
    """Raised when data validation fails."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the validation error.

        Args:
            message (str): Error message.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        super().__init__(message, 400, details)


class AuthenticationError(MeetMatchError):
    """Raised when authentication fails."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the authentication error.

        Args:
            message (str): Error message.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        super().__init__(message, 401, details)


class NotFoundError(MeetMatchError):
    """Raised when a requested resource is not found."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the not found error.

        Args:
            message (str): Error message.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        super().__init__(message, 404, details)


class RateLimitError(MeetMatchError):
    """Raised when rate limiting is triggered."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the rate limit error.

        Args:
            message (str): Error message.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        super().__init__(message, 429, details)


class ExternalServiceError(MeetMatchError):
    """Raised when an external service (Telegram, Supabase, etc.) fails."""

    def __init__(self, message: str, service: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the external service error.

        Args:
            message (str): Error message.
            service (str): Name of the external service.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        error_details = details or {}
        error_details["service"] = service
        super().__init__(message, 502, error_details)


class MatchingError(MeetMatchError):
    """Raised when there's an issue with the matching algorithm."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the matching error.

        Args:
            message (str): Error message.
            details (Optional[Dict[str, Any]]): Additional details.
        """
        super().__init__(message, 500, details)
