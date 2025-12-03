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
