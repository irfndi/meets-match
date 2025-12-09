from unittest.mock import MagicMock, patch

import pytest

from src.utils.database import DatabaseError, UserDB, _model_to_dict, _transform_user_data, execute_query


class TestDatabaseExtended:
    @patch("src.utils.database.get_session")
    def test_select_operators(self, mock_get_session):
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
        # We can't easily assert the expression equality without compiling, but we can verify filter was called
        mock_query.filter.assert_called()

        # Test __in
        execute_query("users", "select", filters={"age__in": [18, 19]})
        mock_query.filter.assert_called()

        # Test __like
        execute_query("users", "select", filters={"username__like": "%test%"})
        mock_query.filter.assert_called()

    @patch("src.utils.database.get_session")
    def test_select_order_by(self, mock_get_session):
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
    def test_insert(self, mock_get_session):
        mock_session = MagicMock()
        mock_get_session.return_value = mock_session

        data = {"id": "1", "first_name": "Test"}
        result = execute_query("users", "insert", data=data)

        mock_session.add.assert_called()
        mock_session.commit.assert_called()
        assert len(result.data) == 1
        assert result.data[0]["id"] == "1"

    @patch("src.utils.database.get_session")
    def test_update_success(self, mock_get_session):
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        # Mock exists check
        mock_query.first.return_value = MagicMock()
        # Mock update
        mock_query.update.return_value = 1

        # Let's mock a UserDB object with minimal structure
        col = MagicMock()
        col.name = "id"

        # Create object and attach __table__ manually to avoid Mock restrictions
        class MockModel:
            class Table:
                columns = [col]  # noqa: RUF012

            __table__ = Table()
            id = "1"
            # Add other attributes needed for log debug calls
            preferences = {}  # noqa: RUF012

        updated_obj = MockModel()

        mock_query.all.return_value = [updated_obj]

        mock_get_session.return_value = mock_session

        execute_query("users", "update", filters={"id": "1"}, data={"first_name": "Updated"})

        mock_query.update.assert_called()
        mock_session.commit.assert_called()

    @patch("src.utils.database.get_session")
    def test_update_not_found(self, mock_get_session):
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
    def test_delete(self, mock_get_session):
        mock_session = MagicMock()
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        mock_get_session.return_value = mock_session

        execute_query("users", "delete", filters={"id": "1"})

        mock_query.delete.assert_called()
        mock_session.commit.assert_called()

    def test_transform_user_data(self):
        data = {
            "id": "1",
            "location": {"latitude": 1.0, "longitude": 2.0, "city": "City", "country": "Country"},
            # We must provide something that triggers the dict check if we want coverage there
            # But the code says: if "preferences" in transformed and transformed["preferences"] is not None:
            "preferences": "some string",  # Invalid dict
        }

        transformed = _transform_user_data(data)

        assert "location" not in transformed
        assert transformed["location_latitude"] == 1.0
        assert transformed["location_city"] == "City"
        # Since it was a string, it should be reset to {}
        assert transformed["preferences"] == {}

    def test_model_to_dict(self):
        # Create a real UserDB instance if possible or a mock with proper attributes
        user = UserDB(
            id="1", location_latitude=1.0, location_longitude=2.0, location_city="City", location_country="Country"
        )

        result = _model_to_dict(user)

        assert "location" in result
        assert result["location"]["city"] == "City"
        assert "location_city" not in result

    def test_invalid_table(self):
        with pytest.raises(ValueError, match="Unknown table"):
            execute_query("invalid_table", "select")

    def test_invalid_query_type(self):
        # execute_query wraps exceptions in DatabaseError
        with pytest.raises(DatabaseError, match="Database operation failed"):
            execute_query("users", "invalid_type")

    @patch("src.utils.database.get_session")
    def test_database_error_handling(self, mock_get_session):
        mock_session = MagicMock()
        mock_get_session.return_value = mock_session
        mock_session.query.side_effect = Exception("DB Error")

        with pytest.raises(DatabaseError, match="Database operation failed"):
            execute_query("users", "select")

        mock_session.rollback.assert_called()
