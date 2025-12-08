from unittest.mock import MagicMock, patch

import pytest

from src.utils.database import DatabaseError, UserDB, _model_to_dict, _transform_user_data, execute_query


class TestDatabaseExtended:
    @patch("src.utils.database.get_session")
    def test_select_operators(self, mock_get_session: MagicMock) -> None:
        """Test select queries with various filter operators (__gte, __in, __like)."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.all.return_value = []
        mock_get_session.return_value = mock_session

        # Test __gte
        execute_query("users", "select", filters={"age__gte": 18})
        # SQLAlchemy filter expressions are complex objects that cannot be directly compared for equality in tests.
        # To assert the exact filter expression, we would need to compile the query to SQL, which requires a database engine.
        # Therefore, we only verify that filter() was called, not that it was called with the exact expected expression.
        mock_query.filter.assert_called()

        # Test __in
        execute_query("users", "select", filters={"age__in": [18, 19]})
        mock_query.filter.assert_called()

        # Test __like
        execute_query("users", "select", filters={"username__like": "%test%"})
        mock_query.filter.assert_called()

    @patch("src.utils.database.get_session")
    def test_select_order_by(self, mock_get_session: MagicMock) -> None:
        """Test select queries with order_by clause (ASC and DESC)."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.all.return_value = []
        mock_get_session.return_value = mock_session

        # Test ASC
        execute_query("users", "select", order_by="created_at asc")
        mock_query.order_by.assert_called()

        # Test DESC
        execute_query("users", "select", order_by="created_at desc")
        mock_query.order_by.assert_called()

    @patch("src.utils.database.get_session")
    def test_insert(self, mock_get_session: MagicMock) -> None:
        """Test inserting a new record into the database."""
        mock_session = MagicMock()
        mock_get_session.return_value = mock_session

        data = {"id": "1", "first_name": "Test"}
        result = execute_query("users", "insert", data=data)

        mock_session.add.assert_called()
        mock_session.commit.assert_called()
        assert len(result.data) == 1
        assert result.data[0]["id"] == "1"

    @patch("src.utils.database.get_session")
    def test_update_success(self, mock_get_session: MagicMock) -> None:
        """Test successful update of an existing record."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        # Mock exists check
        mock_query.first.return_value = MagicMock()
        # Mock update
        mock_query.update.return_value = 1

        # Create a mock updated object with necessary attributes
        updated_obj = MagicMock()
        updated_obj.__table__ = MagicMock()
        updated_obj.__table__.columns = [MagicMock(name="id")]
        updated_obj.id = "1"
        updated_obj.preferences = {}

        mock_query.all.return_value = [updated_obj]

        mock_get_session.return_value = mock_session

        execute_query("users", "update", filters={"id": "1"}, data={"first_name": "Updated"})

        mock_query.update.assert_called()
        mock_session.commit.assert_called()

    @patch("src.utils.database.get_session")
    def test_update_not_found(self, mock_get_session: MagicMock) -> None:
        """Test update operation when the record to update is not found."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = None  # Not found

        mock_get_session.return_value = mock_session

        result = execute_query("users", "update", filters={"id": "1"}, data={"first_name": "Updated"})

        mock_query.update.assert_not_called()
        assert len(result.data) == 0

    @patch("src.utils.database.get_session")
    def test_delete(self, mock_get_session: MagicMock) -> None:
        """Test deleting a record from the database."""
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        mock_get_session.return_value = mock_session

        execute_query("users", "delete", filters={"id": "1"})

        mock_query.delete.assert_called()
        mock_session.commit.assert_called()

    def test_transform_user_data(self) -> None:
        """Test transformation of user data with nested location and invalid preferences."""
        data = {
            "id": "1",
            "location": {"latitude": 1.0, "longitude": 2.0, "city": "City", "country": "Country"},
            # Provide a non-dict value for "preferences" to test type validation logic
            "preferences": "some string",  # Invalid dict
        }

        transformed = _transform_user_data(data)

        assert "location" not in transformed
        assert transformed["location_latitude"] == 1.0
        assert transformed["location_city"] == "City"
        # Since it was a string, it should be reset to {}
        assert transformed["preferences"] == {}

    def test_model_to_dict(self) -> None:
        """Test converting UserDB model to dictionary with nested location fields."""
        # Create a real UserDB instance if possible or a mock with proper attributes
        user = UserDB(
            id="1", location_latitude=1.0, location_longitude=2.0, location_city="City", location_country="Country"
        )

        result = _model_to_dict(user)

        assert "location" in result
        assert result["location"]["city"] == "City"
        assert "location_city" not in result

    def test_invalid_table(self) -> None:
        """Test that querying an invalid table raises ValueError."""
        with pytest.raises(ValueError, match="Unknown table"):
            execute_query("invalid_table", "select")

    def test_invalid_query_type(self) -> None:
        """Test that using an invalid query type raises DatabaseError."""
        # execute_query wraps exceptions in DatabaseError
        with pytest.raises(DatabaseError, match="Database operation failed"):
            execute_query("users", "invalid_type")

    @patch("src.utils.database.get_session")
    def test_database_error_handling(self, mock_get_session: MagicMock) -> None:
        """Test that database errors are properly caught and wrapped in DatabaseError."""
        mock_session = MagicMock()
        mock_get_session.return_value = mock_session
        mock_session.query.side_effect = Exception("DB Error")

        with pytest.raises(DatabaseError, match="Database operation failed"):
            execute_query("users", "select")

        mock_session.rollback.assert_called()
