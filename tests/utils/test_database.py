from unittest.mock import MagicMock, patch

import pytest

from src.config import Settings
from src.utils.database import Database, DatabaseError


class TestDatabaseConnection:
    """Test database connection logic."""

    @patch("src.utils.database.create_engine")
    @patch("src.config.get_settings")
    def test_postgres_scheme_replacement(self, mock_get_settings, mock_create_engine):
        """Test that postgres:// is replaced with postgresql://."""
        # Setup mock settings
        mock_settings = MagicMock(spec=Settings)
        mock_settings.DATABASE_URL = "postgres://user:pass@localhost:5432/db"
        mock_settings.DEBUG = False
        mock_get_settings.return_value = mock_settings

        # Reset singleton
        Database._engine = None

        # Call get_engine
        Database.get_engine()

        # Verify create_engine was called with corrected URL
        mock_create_engine.assert_called_once()
        args, _ = mock_create_engine.call_args
        assert args[0] == "postgresql://user:pass@localhost:5432/db"

    @patch("src.utils.database.create_engine")
    @patch("src.config.get_settings")
    def test_postgresql_scheme_remains(self, mock_get_settings, mock_create_engine):
        """Test that postgresql:// is left unchanged."""
        # Setup mock settings
        mock_settings = MagicMock(spec=Settings)
        mock_settings.DATABASE_URL = "postgresql://user:pass@localhost:5432/db"
        mock_settings.DEBUG = False
        mock_get_settings.return_value = mock_settings

        # Reset singleton
        Database._engine = None

        # Call get_engine
        Database.get_engine()

        # Verify create_engine was called with original URL
        mock_create_engine.assert_called_once()
        args, _ = mock_create_engine.call_args
        assert args[0] == "postgresql://user:pass@localhost:5432/db"

    @patch("src.config.get_settings")
    def test_missing_database_url(self, mock_get_settings):
        """Test error when DATABASE_URL is missing."""
        # Setup mock settings
        mock_settings = MagicMock(spec=Settings)
        mock_settings.DATABASE_URL = ""
        mock_get_settings.return_value = mock_settings

        # Reset singleton
        Database._engine = None

        # Verify exception
        with pytest.raises(DatabaseError, match="DATABASE_URL is not configured"):
            Database.get_engine()

    @patch("src.utils.database.create_engine")
    @patch("src.config.get_settings")
    def test_get_session_factory(self, mock_get_settings, mock_create_engine):
        """Test session factory creation."""
        mock_settings = MagicMock(spec=Settings)
        mock_settings.DATABASE_URL = "postgresql://user:pass@localhost:5432/db"
        mock_settings.DEBUG = False
        mock_get_settings.return_value = mock_settings

        # Reset singletons
        Database._engine = None
        Database._session_factory = None

        # Get session factory
        factory = Database.get_session_factory()

        # Verify it was created
        assert factory is not None
        assert Database._session_factory is not None

    @patch("src.utils.database.create_engine")
    @patch("src.config.get_settings")
    def test_engine_singleton(self, mock_get_settings, mock_create_engine):
        """Test that engine is a singleton."""
        mock_settings = MagicMock(spec=Settings)
        mock_settings.DATABASE_URL = "postgresql://user:pass@localhost:5432/db"
        mock_settings.DEBUG = False
        mock_get_settings.return_value = mock_settings

        # Reset singleton
        Database._engine = None

        # Get engine twice
        engine1 = Database.get_engine()
        engine2 = Database.get_engine()

        # Verify same instance
        assert engine1 is engine2
        # Verify create_engine called only once
        assert mock_create_engine.call_count == 1

    @patch("src.utils.database.logger")
    @patch("src.utils.database.create_engine")
    @patch("src.config.get_settings")
    def test_create_engine_failure(self, mock_get_settings, mock_create_engine, mock_logger):
        """Test handling of engine creation failure."""
        mock_settings = MagicMock(spec=Settings)
        mock_settings.DATABASE_URL = "postgresql://user:pass@localhost:5432/db"
        mock_settings.DEBUG = False
        mock_get_settings.return_value = mock_settings

        # Make create_engine raise an exception
        mock_create_engine.side_effect = Exception("Connection failed")

        # Reset singleton
        Database._engine = None

        # Verify exception is raised
        with pytest.raises(DatabaseError, match="Failed to connect to database") as excinfo:
            Database.get_engine()

        error_details = excinfo.value.details
        assert error_details["error"] == "Connection failed"
        assert error_details["url"] == "postgresql://user:***@localhost:5432/db"

        mock_logger.error.assert_called_once()
        args, kwargs = mock_logger.error.call_args
        assert args[0] == "Failed to create database engine"
        assert kwargs["error"] == "Connection failed"
        assert kwargs["url"] == "postgresql://user:***@localhost:5432/db"
