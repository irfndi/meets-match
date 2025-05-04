# Placeholder content for test_report_service.py
from datetime import date, datetime
from unittest.mock import ANY, AsyncMock, MagicMock, call, patch

import pytest

from src.config import Settings
from src.models.report import ALLOWED_REPORT_REASONS
from src.models.user import User
from src.services.report_service import report_user
from src.utils.errors import NotFoundError


# Patch the dependency for get_user
@patch("src.services.report_service.get_user", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_report_user_success(mock_get_user: AsyncMock) -> None:
    """Test successfully reporting a user without triggering a ban."""
    reporter_id = "reporter1"
    reported_id = "reported2"
    reason = ALLOWED_REPORT_REASONS[0]  # Use the first valid reason

    # Mock the Cloudflare environment and D1 database
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_env.DB = mock_db
    # Mock the nested settings attribute
    mock_env.settings = MagicMock()
    mock_env.settings.report_ban_window_days = 30  # Example value

    # Mock D1 prepared statements and the objects returned by bind
    mock_check_stmt = MagicMock()
    mock_check_stmt.bind = MagicMock(return_value=mock_check_stmt)
    mock_check_stmt.first = AsyncMock(return_value=None)

    mock_insert_stmt = MagicMock()
    mock_insert_stmt.bind = MagicMock(return_value=mock_insert_stmt)
    mock_insert_stmt.run = AsyncMock(return_value=MagicMock(meta=MagicMock(last_row_id=1)))

    # Custom class to mock the bound statement for the count query
    class BoundCountStmtMock:
        async def first(self, *args, **kwargs):
            # The code expects .first() to return the dictionary directly
            return {"report_count": 1}

    mock_count_stmt = MagicMock()
    mock_count_stmt.bind = MagicMock(return_value=BoundCountStmtMock())  # Return instance of custom class

    # Configure the DB mock to return the prepared statements
    mock_db.prepare = MagicMock(
        side_effect=[
            mock_check_stmt,  # For checking existing report
            mock_insert_stmt,  # For inserting the new report
            mock_count_stmt,  # For counting recent reports
        ]
    )

    # Mock get_user to return active users
    mock_reporter = User(
        id=reporter_id,
        telegram_id=111,
        is_active=True,
        full_name="Reporter Name",
        birth_date=date(2000, 1, 1),
        gender="male",
        created_at=datetime.now(),
    )
    mock_reported = User(
        id=reported_id,
        telegram_id=222,
        is_active=True,
        full_name="Reported Name",
        birth_date=date(1999, 12, 31),
        gender="female",
        created_at=datetime.now(),
    )
    mock_get_user.side_effect = [mock_reporter, mock_reported]

    # Call the function under test
    success, message = await report_user(mock_env, reporter_id, reported_id, reason)

    # Assertions
    assert success is True
    assert message == "Report submitted successfully."

    # Check get_user calls
    mock_get_user.assert_has_awaits([call(mock_env, reporter_id), call(mock_env, reported_id)])

    # Check DB prepare calls (order matters based on side_effect)
    assert mock_db.prepare.call_count == 3
    assert "SELECT id FROM reports WHERE reporter_id = ?" in mock_db.prepare.call_args_list[0][0][0]
    assert "INSERT INTO reports" in mock_db.prepare.call_args_list[1][0][0]
    assert (
        "SELECT COUNT(id) as report_count FROM reports WHERE reported_id = ? AND created_at >= ?"
        in mock_db.prepare.call_args_list[2][0][0]
    )

    # Check bind/first/run calls on the statements
    mock_check_stmt.bind.assert_called_once_with(reporter_id, reported_id, ANY)  # Use ANY for datetime
    mock_check_stmt.first.assert_awaited_once()

    # Assert bind was called once, use ANY for the UUID and datetime objects
    mock_insert_stmt.bind.assert_called_once_with(ANY, reporter_id, reported_id, reason, ANY)
    mock_insert_stmt.run.assert_awaited_once()

    # Assert bind uses reported_id and the ANY matcher for the timestamp
    mock_count_stmt.bind.assert_called_once_with(reported_id, ANY)
    # Cannot directly assert await on the custom class method,
    # but bind assertion and overall test success imply it worked.


@patch("src.services.report_service.get_user", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_report_user_already_reported(mock_get_user: AsyncMock) -> None:
    """Test reporting a user who has already been reported recently by the same reporter."""
    reporter_id = "reporter1"
    reported_id = "reported2"
    reason = ALLOWED_REPORT_REASONS[0]

    # Mock the Cloudflare environment and D1 database
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_env.DB = mock_db
    # Mock the nested settings attribute
    mock_env.settings = MagicMock()
    mock_env.settings.report_ban_window_days = 30  # Example value

    # Mock the check statement to return an existing report
    mock_check_stmt = MagicMock()
    mock_check_stmt.bind = MagicMock(return_value=mock_check_stmt)
    # Simulate finding an existing report
    mock_check_stmt.first = AsyncMock(return_value={"id": "existing_report_123"})

    # Configure the DB mock to return only the check statement
    # No insert or count should happen in this case
    mock_db.prepare = MagicMock(return_value=mock_check_stmt)

    # Mock get_user - needed for the initial checks in report_user
    mock_reporter = User(
        id=reporter_id,
        telegram_id=111,
        is_active=True,
        full_name="Reporter",
        birth_date=date(2000, 1, 1),
        gender="male",
        created_at=datetime.now(),
    )
    mock_reported = User(
        id=reported_id,
        telegram_id=222,
        is_active=True,
        full_name="Reported",
        birth_date=date(1999, 1, 1),
        gender="female",
        created_at=datetime.now(),
    )
    mock_get_user.side_effect = [mock_reporter, mock_reported]

    # Call the function under test
    success, message = await report_user(mock_env, reporter_id, reported_id, reason)

    # Assertions
    assert success is False
    assert message == "You have already reported this user recently."

    # Check get_user calls
    mock_get_user.assert_has_awaits([call(mock_env, reporter_id), call(mock_env, reported_id)])

    # Check DB prepare was called only once for the check
    mock_db.prepare.assert_called_once()
    assert "SELECT id FROM reports WHERE reporter_id = ?" in mock_db.prepare.call_args_list[0][0][0]

    # Check bind and first were called on the check statement
    mock_check_stmt.bind.assert_called_once_with(reporter_id, reported_id, ANY)
    mock_check_stmt.first.assert_awaited_once()


@patch("src.services.report_service.update_user", new_callable=AsyncMock)
@patch("src.services.report_service.get_user", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_report_user_triggers_ban(mock_get_user: AsyncMock, mock_update_user: AsyncMock) -> None:
    """Test that submitting a report triggers a ban (user deactivation) when the threshold is met."""
    reporter_id = "reporter1"
    reported_id = "reported2"
    reason = ALLOWED_REPORT_REASONS[1]  # Use a different valid reason

    # Mock the Cloudflare environment and D1 database
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_env.DB = mock_db
    # Initialize the nested settings attribute
    mock_env.settings = MagicMock()
    mock_env.settings.report_ban_threshold = 5
    mock_env.settings.report_ban_window_days = 7  # Also mock the window days

    # Mock D1 prepared statements
    mock_check_stmt = MagicMock()
    mock_check_stmt.bind = MagicMock(return_value=mock_check_stmt)
    mock_check_stmt.first = AsyncMock(return_value=None)  # No existing report by this reporter

    mock_insert_stmt = MagicMock()
    mock_insert_stmt.bind = MagicMock(return_value=mock_insert_stmt)
    mock_insert_stmt.run = AsyncMock(return_value=MagicMock(meta=MagicMock(last_row_id=2)))  # New report ID

    # Custom class to mock the bound statement for the count query
    class BoundCountStmtMock:
        async def first(self, *args, **kwargs):
            # Return count meeting the threshold
            return {"report_count": 5}

    mock_count_stmt = MagicMock()
    mock_count_stmt.bind = MagicMock(return_value=BoundCountStmtMock())

    # Configure the DB mock to return the prepared statements in order
    mock_db.prepare = MagicMock(
        side_effect=[
            mock_check_stmt,  # For checking existing report
            mock_insert_stmt,  # For inserting the new report
            mock_count_stmt,  # For counting recent reports
        ]
    )

    # Mock get_user to return active users
    mock_reporter = User(
        id=reporter_id,
        telegram_id=111,
        is_active=True,
        full_name="Reporter",
        birth_date=date(2000, 1, 1),
        gender="male",
        created_at=datetime.now(),
    )
    mock_reported = User(
        id=reported_id,
        telegram_id=222,
        is_active=True,
        full_name="Reported",
        birth_date=date(1999, 1, 1),
        gender="female",
        created_at=datetime.now(),
    )
    mock_get_user.side_effect = [mock_reporter, mock_reported]

    # Call the function under test
    success, message = await report_user(mock_env, reporter_id, reported_id, reason)

    # Assertions
    assert success is True
    assert message == "Report submitted successfully. User has been banned due to multiple reports."

    # Assert update_user was called to deactivate the user
    mock_update_user.assert_awaited_once_with(mock_env, reported_id, {"is_active": False})

    # Check get_user calls
    mock_get_user.assert_has_awaits([call(mock_env, reporter_id), call(mock_env, reported_id)])

    # Check DB prepare calls
    assert mock_db.prepare.call_count == 3

    # Check bind/first/run calls
    mock_check_stmt.bind.assert_called_once_with(reporter_id, reported_id, ANY)
    mock_check_stmt.first.assert_awaited_once()
    mock_insert_stmt.bind.assert_called_once_with(ANY, reporter_id, reported_id, reason, ANY)
    mock_insert_stmt.run.assert_awaited_once()
    mock_count_stmt.bind.assert_called_once_with(reported_id, ANY)
    # Check that the 'first' method of the bound mock object was awaited (implicitly)
    # We rely on the overall test success and the update_user call assertion here


# Test for invalid report reason
@pytest.mark.asyncio
async def test_report_user_invalid_reason() -> None:
    """Test reporting with an invalid reason."""
    reporter_id = "reporter1"
    reported_id = "reported2"
    invalid_reason = "invalid_reason_string"
    mock_env = MagicMock(spec=Settings)

    # Call the function under test
    success, message = await report_user(mock_env, reporter_id, reported_id, invalid_reason)

    # Assertions
    assert success is False
    assert "Invalid report reason. Must be one of:" in message
    assert str(ALLOWED_REPORT_REASONS) in message


# Test for reporter not found
@patch("src.services.report_service.get_user", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_report_user_reporter_not_found(mock_get_user: AsyncMock) -> None:
    """Test reporting when the reporter user is not found."""
    reporter_id = "nonexistent_reporter"
    reported_id = "reported2"
    reason = ALLOWED_REPORT_REASONS[0]
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_env.DB = mock_db

    # Mock get_user to raise NotFoundError for the reporter
    mock_get_user.side_effect = NotFoundError(f"User not found: {reporter_id}")

    # Call the function under test
    success, message = await report_user(mock_env, reporter_id, reported_id, reason)

    # Assertions
    assert success is False
    assert "Reporter not found" in message
    mock_get_user.assert_awaited_once_with(mock_env, reporter_id)
    mock_db.prepare.assert_not_called()


# Test for reported user not found
@patch("src.services.report_service.get_user", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_report_user_reported_not_found(mock_get_user: AsyncMock) -> None:
    """Test reporting when the reported user is not found."""
    reporter_id = "reporter1"
    reported_id = "nonexistent_reported"
    reason = ALLOWED_REPORT_REASONS[0]
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_env.DB = mock_db

    # Mock get_user: return reporter, then raise NotFoundError for reported user
    mock_reporter = User(
        id=reporter_id,
        telegram_id=111,
        is_active=True,
        full_name="Reporter",
        birth_date=date(2000, 1, 1),
        gender="male",
        created_at=datetime.now(),
    )
    mock_get_user.side_effect = [mock_reporter, NotFoundError(f"User not found: {reported_id}")]

    # Call the function under test
    success, message = await report_user(mock_env, reporter_id, reported_id, reason)

    # Assertions
    assert success is False
    assert "Reported user not found" in message
    mock_get_user.assert_has_awaits([call(mock_env, reporter_id), call(mock_env, reported_id)])
    mock_db.prepare.assert_not_called()


# Add tests for get_report_details, notify_admins, error handling, etc.
