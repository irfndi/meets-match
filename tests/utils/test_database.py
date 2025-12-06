from unittest.mock import MagicMock, patch

import pytest

from src.config import Settings
from src.utils.database import Database, DatabaseError, execute_query


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


class TestOrFilterLogic:
    """Test $or filter functionality in execute_query."""

    @patch("src.utils.database.get_session")
    def test_or_filter_single_field_conditions(self, mock_get_session):
        """Test $or with single-field conditions: {"$or": [{"field1": v1}, {"field2": v2}]}."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []
        mock_get_session.return_value = mock_session

        # Execute query with $or filter containing single-field conditions on different fields
        filters = {"$or": [{"first_name": "Alice"}, {"age": 25}]}
        execute_query(table="users", query_type="select", filters=filters)

        # Verify that filter was called with an OR expression
        mock_query.filter.assert_called()
        filter_call = mock_query.filter.call_args
        filter_expression = filter_call[0][0]

        # Verify the SQL generated contains OR and both fields
        compiled = str(filter_expression.compile(compile_kwargs={"literal_binds": True}))
        assert "OR" in compiled
        assert "first_name" in compiled
        assert "age" in compiled

    @patch("src.utils.database.get_session")
    def test_or_filter_multi_field_and_conditions(self, mock_get_session):
        """Test $or with multi-field AND conditions: {"$or": [{"f1": v1, "f2": v2}, {"f3": v3}]}."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []
        mock_get_session.return_value = mock_session

        # Execute query with $or filter containing multi-field AND conditions
        # This is the bug that was fixed - multi-field dicts should be ANDed together
        filters = {"$or": [{"gender": "female", "is_active": True}, {"gender": "male", "is_active": False}]}
        execute_query(table="users", query_type="select", filters=filters)

        # Verify that filter was called
        mock_query.filter.assert_called()
        filter_call = mock_query.filter.call_args
        filter_expression = filter_call[0][0]

        # Verify the SQL contains proper structure: (f1 AND f2) OR (f3 AND f4)
        compiled = str(filter_expression.compile(compile_kwargs={"literal_binds": True}))
        assert "OR" in compiled
        # The expression should contain AND for multi-field conditions
        assert "AND" in compiled
        assert "gender" in compiled
        assert "is_active" in compiled

    @patch("src.utils.database.get_session")
    def test_or_filter_mixed_with_regular_conditions(self, mock_get_session):
        """Test $or combined with regular filter conditions."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []
        mock_get_session.return_value = mock_session

        # Execute query with both regular filter and $or filter
        filters = {"is_active": True, "$or": [{"gender": "female"}, {"gender": "male"}]}
        execute_query(table="users", query_type="select", filters=filters)

        # Verify that filter was called twice (once for regular field, once for $or)
        assert mock_query.filter.call_count == 2

    @patch("src.utils.database.get_session")
    def test_or_filter_empty_conditions_handled(self, mock_get_session):
        """Test $or with empty condition list doesn't break."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []
        mock_get_session.return_value = mock_session

        # Execute query with empty $or list
        filters = {"$or": []}
        execute_query(table="users", query_type="select", filters=filters)

        # Verify that filter was NOT called (empty $or should be skipped)
        mock_query.filter.assert_not_called()

    @patch("src.utils.database.get_session")
    def test_or_filter_matching_service_pattern(self, mock_get_session):
        """Test $or with pattern used in matching_service.py (multi-field AND in OR clauses)."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []
        mock_get_session.return_value = mock_session

        # Simplified pattern from matching_service.py to test multi-field AND within OR clauses
        # Real usage: {"$or": [{"user1_id": x, "user1_action": y}, {"user2_id": x, "user2_action": y}]}
        filters = {
            "$or": [
                {"first_name": "Alice", "is_active": True},
                {"first_name": "Bob", "is_active": False},
            ]
        }
        execute_query(table="users", query_type="select", filters=filters)

        # Verify that filter was called with proper OR expression containing ANDs
        mock_query.filter.assert_called()
        filter_call = mock_query.filter.call_args
        filter_expression = filter_call[0][0]

        # Verify structure: (first_name='Alice' AND is_active=true) OR (first_name='Bob' AND is_active=false)
        compiled = str(filter_expression.compile(compile_kwargs={"literal_binds": True}))
        assert "OR" in compiled
        assert "AND" in compiled
        assert "first_name" in compiled
        assert "is_active" in compiled
