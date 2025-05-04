# tests/utils/test_logging.py
import logging
import os
from unittest.mock import MagicMock, Mock, patch

import structlog

from src.utils import logging as custom_logging

# --- Tests for configure_logging ---


@patch("src.utils.logging.get_settings")
@patch("src.utils.logging.os.makedirs")
@patch("src.utils.logging.logging.getLogger")
@patch("src.utils.logging.logging.FileHandler")
@patch("src.utils.logging.structlog.configure")
def test_configure_logging_development(
    mock_structlog_configure: Mock,
    mock_filehandler_cls: Mock,
    mock_get_logger_cls: Mock,
    mock_makedirs: Mock,
    mock_get_settings: Mock,
) -> None:
    """Test configure_logging sets up correctly for development environment."""
    # --- Arrange ---
    # Mock settings
    mock_settings_instance = MagicMock()
    mock_settings_instance.LOG_LEVEL = "DEBUG"
    mock_settings_instance.ENVIRONMENT = "development"
    mock_get_settings.return_value = mock_settings_instance

    # Mock logger and handler instances
    mock_root_logger = MagicMock()
    mock_get_logger_cls.return_value = mock_root_logger
    mock_file_handler_instance = MagicMock()
    mock_filehandler_cls.return_value = mock_file_handler_instance

    log_dir = "log"
    log_file = os.path.join(log_dir, "app.log")

    # --- Act ---
    custom_logging.configure_logging()

    # --- Assert ---
    mock_get_settings.assert_called_once()
    mock_makedirs.assert_called_once_with(log_dir, exist_ok=True)
    mock_get_logger_cls.assert_called_once_with()  # Called with no args for root logger
    mock_root_logger.setLevel.assert_called_once_with(logging.DEBUG)
    mock_filehandler_cls.assert_called_once_with(log_file)
    mock_root_logger.addHandler.assert_called_once_with(mock_file_handler_instance)

    # Check structlog configuration
    mock_structlog_configure.assert_called_once()
    args, kwargs = mock_structlog_configure.call_args
    processors = kwargs.get("processors", [])
    # Check if ConsoleRenderer is the last processor for dev
    assert len(processors) > 0
    assert isinstance(processors[-1], structlog.dev.ConsoleRenderer)
    assert kwargs.get("logger_factory") is not None
    assert kwargs.get("wrapper_class") is not None
    assert kwargs.get("cache_logger_on_first_use") is True


@patch("src.utils.logging.get_settings")
@patch("src.utils.logging.os.makedirs")
@patch("src.utils.logging.logging.getLogger")
@patch("src.utils.logging.logging.FileHandler")
@patch("src.utils.logging.structlog.configure")
def test_configure_logging_production(
    mock_structlog_configure: Mock,
    mock_filehandler_cls: Mock,
    mock_get_logger_cls: Mock,
    mock_makedirs: Mock,
    mock_get_settings: Mock,
) -> None:
    """Test configure_logging sets up correctly for production environment."""
    # --- Arrange ---
    # Mock settings
    mock_settings_instance = MagicMock()
    mock_settings_instance.LOG_LEVEL = "INFO"
    mock_settings_instance.ENVIRONMENT = "production"
    mock_get_settings.return_value = mock_settings_instance

    # Mock logger and handler instances
    mock_root_logger = MagicMock()
    mock_get_logger_cls.return_value = mock_root_logger
    mock_file_handler_instance = MagicMock()
    mock_filehandler_cls.return_value = mock_file_handler_instance

    # --- Act ---
    custom_logging.configure_logging()

    # --- Assert ---
    # Basic checks (covered in dev test, but good to have quick checks)
    mock_get_settings.assert_called_once()
    mock_makedirs.assert_called_once()
    mock_root_logger.setLevel.assert_called_once_with(logging.INFO)
    mock_root_logger.addHandler.assert_called_once()

    # Check structlog configuration for production
    mock_structlog_configure.assert_called_once()
    args, kwargs = mock_structlog_configure.call_args
    processors = kwargs.get("processors", [])
    # Check if JSONRenderer is the last processor for prod
    assert len(processors) > 0
    assert isinstance(processors[-1], structlog.processors.JSONRenderer)


# --- Tests for get_logger ---


@patch("src.utils.logging.structlog.get_logger")
def test_get_logger(mock_structlog_get_logger: Mock) -> None:
    """Test get_logger returns a bound logger."""
    # --- Arrange ---
    mock_logger = MagicMock()
    mock_bound_logger = MagicMock()
    mock_logger.bind.return_value = mock_bound_logger
    mock_structlog_get_logger.return_value = mock_logger

    logger_name = "test_module"
    initial_data = {"user_id": 123}

    # --- Act ---
    logger = custom_logging.get_logger(logger_name, **initial_data)

    # --- Assert ---
    mock_structlog_get_logger.assert_called_once_with(logger_name)
    mock_logger.bind.assert_called_once_with(**initial_data)
    assert logger is mock_bound_logger


# --- Tests for log_error ---


def test_log_error_basic() -> None:
    """Test log_error logs basic exception info."""
    # --- Arrange ---
    mock_logger = MagicMock(spec=structlog.stdlib.BoundLogger)
    test_error = ValueError("Something went wrong")
    test_message = "Test error occurred"
    extra_context = {"request_id": "abc"}

    # --- Act ---
    custom_logging.log_error(mock_logger, test_error, test_message, extra_context)

    # --- Assert ---
    expected_context = {
        "error_type": "ValueError",
        "error_message": "Something went wrong",
        "request_id": "abc",  # Ensure extra context is merged
    }
    mock_logger.error.assert_called_once_with(test_message, **expected_context, exc_info=test_error)


def test_log_error_with_details() -> None:
    """Test log_error includes details if present in the exception."""
    # --- Arrange ---
    mock_logger = MagicMock(spec=structlog.stdlib.BoundLogger)

    # Custom exception with a 'details' attribute
    class DetailedError(Exception):
        def __init__(self, message, details):
            super().__init__(message)
            self.details = details

    test_error = DetailedError("Detailed issue", {"code": 500, "reason": "timeout"})

    # --- Act ---
    custom_logging.log_error(mock_logger, test_error)

    # --- Assert ---
    expected_context = {
        "error_type": "DetailedError",
        "error_message": "Detailed issue",
        "error_details": {"code": 500, "reason": "timeout"},
    }
    mock_logger.error.assert_called_once_with("An error occurred", **expected_context, exc_info=test_error)


def test_log_error_no_message_or_extra() -> None:
    """Test log_error works without optional message and extra context."""
    # --- Arrange ---
    mock_logger = MagicMock(spec=structlog.stdlib.BoundLogger)
    test_error = TypeError("Bad type")

    # --- Act ---
    custom_logging.log_error(mock_logger, test_error)

    # --- Assert ---
    expected_context = {
        "error_type": "TypeError",
        "error_message": "Bad type",
    }
    mock_logger.error.assert_called_once_with("An error occurred", **expected_context, exc_info=test_error)
