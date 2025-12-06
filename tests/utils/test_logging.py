from unittest.mock import MagicMock, patch

from src.utils.logging import configure_logging, get_logger, log_error


@patch("src.utils.logging.structlog")
@patch("src.utils.logging.logging")
@patch("src.utils.logging.settings")
def test_configure_logging_development(mock_settings, mock_logging, mock_structlog):
    mock_settings.LOG_LEVEL = "DEBUG"
    mock_settings.ENVIRONMENT = "development"

    configure_logging()

    # Check logging configuration
    mock_logging.basicConfig.assert_called_once()
    _args, kwargs = mock_logging.basicConfig.call_args
    # mock_logging.DEBUG is a MagicMock, so we compare against it
    assert kwargs["level"] == mock_logging.DEBUG

    # Check structlog configuration
    mock_structlog.configure.assert_called_once()
    processors = mock_structlog.configure.call_args[1]["processors"]
    # In development, we expect ConsoleRenderer
    # processors contains the return value of ConsoleRenderer()
    assert mock_structlog.dev.ConsoleRenderer.return_value in processors


@patch("src.utils.logging.structlog")
@patch("src.utils.logging.logging")
@patch("src.utils.logging.settings")
def test_configure_logging_production(mock_settings, mock_logging, mock_structlog):
    mock_settings.LOG_LEVEL = "INFO"
    mock_settings.ENVIRONMENT = "production"

    configure_logging()

    # Check logging configuration
    mock_logging.basicConfig.assert_called_once()

    # Check structlog configuration
    mock_structlog.configure.assert_called_once()
    processors = mock_structlog.configure.call_args[1]["processors"]
    # In production, we expect JSONRenderer
    assert mock_structlog.processors.JSONRenderer.return_value in processors


@patch("src.utils.logging.structlog")
def test_get_logger(mock_structlog):
    mock_logger = MagicMock()
    mock_structlog.get_logger.return_value = mock_logger

    logger = get_logger("test_logger", foo="bar")

    mock_structlog.get_logger.assert_called_with("test_logger")
    mock_logger.bind.assert_called_with(foo="bar")
    assert logger == mock_logger.bind.return_value


def test_log_error():
    mock_logger = MagicMock()
    error = ValueError("test error")

    log_error(mock_logger, error, "something went wrong", {"user_id": 1})

    mock_logger.error.assert_called_once()
    args, kwargs = mock_logger.error.call_args
    assert args[0] == "something went wrong"
    assert kwargs["user_id"] == 1
    assert kwargs["error_type"] == "ValueError"
    assert kwargs["error_message"] == "test error"
    assert kwargs["exc_info"] == error


def test_log_error_with_details():
    mock_logger = MagicMock()

    class CustomError(Exception):
        def __init__(self, msg, details):
            super().__init__(msg)
            self.details = details

    error = CustomError("custom error", {"code": 123})

    log_error(mock_logger, error)

    mock_logger.error.assert_called_once()
    args, kwargs = mock_logger.error.call_args
    assert args[0] == "An error occurred"
    assert kwargs["error_details"] == {"code": 123}
