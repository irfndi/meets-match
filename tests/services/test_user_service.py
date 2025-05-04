from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from src.config import Settings
from src.models.user import Location, Preferences, RelationshipType, User
from src.services.user_service import (
    create_user,
    delete_user,
    get_user,
    get_user_profile_photo_url,
    update_user,
)
from src.utils.errors import NotFoundError, ValidationError


@pytest.mark.asyncio
async def test_get_user_found():
    """Test successfully retrieving an existing user."""
    user_id = "user1"
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_env.DB = mock_db

    # Mock D1 response for finding the user
    mock_stmt = MagicMock()
    mock_stmt.bind = MagicMock(return_value=mock_stmt)
    expected_user_data = {
        "id": user_id,
        "telegram_id": 12345,
        "is_active": True,
        "full_name": "Test User",
        "birth_date": date(2000, 1, 1).isoformat(),
        "gender": "other",
        "created_at": datetime.now().isoformat(),
        # Add other required fields with default values
        "bio": None,
        "work": None,
        "education": None,
        "interests": [],
        "profile_photo_url": None,
        "latitude": None,
        "longitude": None,
        "city": None,
        "country": None,
        "min_age_preference": 18,
        "max_age_preference": 99,
        "distance_preference_km": 50,
        "gender_preference": "any",
        "notification_matches": True,
        "notification_messages": True,
        "notification_promotions": False,
        "last_active": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    mock_stmt.first = AsyncMock(return_value=expected_user_data)
    mock_db.prepare = MagicMock(return_value=mock_stmt)

    # Call the function
    user = await get_user(mock_env, user_id)

    # Assertions
    assert isinstance(user, User)
    assert user.id == user_id
    assert user.full_name == "Test User"
    mock_db.prepare.assert_called_once()
    mock_stmt.bind.assert_called_once_with(user_id)


@pytest.mark.asyncio
async def test_get_user_not_found():
    """Test that NotFoundError is raised when a user is not found."""
    user_id = "nonexistent_user"
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_env.DB = mock_db

    # Mock D1 response for not finding the user
    mock_stmt = MagicMock()
    mock_stmt.bind = MagicMock(return_value=mock_stmt)
    mock_stmt.first = AsyncMock(return_value=None)  # Simulate user not found
    mock_db.prepare = MagicMock(return_value=mock_stmt)

    # Call the function and assert NotFoundError
    with pytest.raises(NotFoundError) as excinfo:
        await get_user(mock_env, user_id)

    assert f"User not found: {user_id}" in str(excinfo.value)
    mock_db.prepare.assert_called_once()
    mock_stmt.bind.assert_called_once_with(user_id)


# --- create_user Tests ---


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")  # Patch get_user used within create_user
async def test_create_user_success(mock_get_user):
    """Test successfully creating a new user."""
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_kv = MagicMock()
    mock_env.DB = mock_db
    mock_env.KV = mock_kv

    # Mock get_user to indicate user does NOT exist initially
    mock_get_user.side_effect = NotFoundError("User not found")

    # Mock D1 insert operation
    mock_insert_stmt = MagicMock()
    mock_insert_stmt.bind = MagicMock(return_value=mock_insert_stmt)
    mock_insert_stmt.run = AsyncMock()  # Assuming run() doesn't return crucial info here
    mock_db.prepare = MagicMock(return_value=mock_insert_stmt)

    # Mock KV put operation (for caching)
    mock_kv.put = AsyncMock()

    # Create a valid User object
    new_user_data = {
        "id": "new_user_id",
        "telegram_id": 67890,
        "is_active": True,
        "full_name": "New User",
        "birth_date": date(1995, 5, 5),
        "gender": "female",
        "created_at": datetime.now(),
        # Add other fields, ensuring defaults or valid values
        "interests": ["coding", "hiking"],
        "min_age_preference": 25,
        "max_age_preference": 40,
        "distance_preference_km": 100,
        "gender_preference": "male",
    }
    new_user = User(**new_user_data)

    # Call create_user
    created_user = await create_user(mock_env, new_user)

    # Assertions
    assert created_user.id == new_user.id
    assert created_user.full_name == "New User"
    # Check DB interaction
    mock_db.prepare.assert_called_once()  # Check SQL (might need refinement)
    mock_insert_stmt.bind.assert_called_once()  # Check binding args (more detailed check needed)
    mock_insert_stmt.run.assert_awaited_once()
    # Check KV interaction (cache put)
    mock_kv.put.assert_awaited_once()
    # Check get_user was called to check existence
    mock_get_user.assert_awaited_once_with(mock_env, new_user.id)


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
async def test_create_user_already_exists(mock_get_user):
    """Test attempting to create a user that already exists."""
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()  # DB shouldn't be touched if user exists
    mock_env.DB = mock_db

    # Create a dummy User object
    existing_user_data = {
        "id": "existing_user_id",
        "telegram_id": 11223,
        "is_active": True,
        "full_name": "Existing User",
        "birth_date": date(1990, 10, 10),
        "gender": "male",
    }
    existing_user = User(**existing_user_data)

    # Mock get_user to return the existing user
    mock_get_user.return_value = existing_user

    # Call create_user and expect ValidationError
    with pytest.raises(ValidationError) as excinfo:
        await create_user(mock_env, existing_user)

    assert "User already exists" in str(excinfo.value)
    mock_get_user.assert_awaited_once_with(mock_env, existing_user.id)
    mock_db.prepare.assert_not_called()  # Ensure DB insert wasn't attempted


# --- update_user Tests ---


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")  # Patch get_user used within update_user
async def test_update_user_success(mock_get_user):
    """Test successfully updating an existing user."""
    user_id = "user_to_update"
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_kv = MagicMock()
    mock_env.DB = mock_db
    mock_env.KV = mock_kv

    # Mock existing user data
    existing_user_data = {
        "id": user_id,
        "telegram_id": 55555,
        "is_active": True,
        "full_name": "Update Me",
        "birth_date": date(1988, 8, 8),
        "gender": "male",
        "bio": "Old bio",
    }
    existing_user = User(**existing_user_data)

    # Create the expected updated user object
    updated_user_data = existing_user_data.copy()
    updated_user_data.update({"bio": "New bio", "full_name": "Updated Name"})
    expected_updated_user = User(**updated_user_data)

    # Mock get_user: first call returns original, second returns updated
    mock_get_user.side_effect = [existing_user, expected_updated_user]

    # Mock D1 update operation
    mock_update_stmt = MagicMock()
    mock_update_stmt.bind = MagicMock(return_value=mock_update_stmt)
    mock_update_stmt.run = AsyncMock()
    mock_db.prepare = MagicMock(return_value=mock_update_stmt)

    # Mock KV delete operation (for cache invalidation)
    mock_kv.delete = AsyncMock()

    # Data to update
    update_data = {"bio": "New bio", "full_name": "Updated Name"}

    # Call update_user
    updated_user = await update_user(mock_env, user_id, update_data)

    # Assertions
    assert updated_user is not None
    assert updated_user.id == user_id
    assert updated_user.bio == "New bio"  # Check updated field
    assert updated_user.full_name == "Updated Name"  # Check another updated field
    assert updated_user.gender == "male"  # Check unchanged field
    # Check DB interaction
    mock_db.prepare.assert_called_once()  # Check SQL (needs more specific check)
    mock_update_stmt.bind.assert_called_once()  # Check bound values (needs specific check)
    mock_update_stmt.run.assert_awaited_once()
    # Check KV interaction (cache delete)
    mock_kv.delete.assert_awaited_once()
    # Check get_user was called (potentially multiple times if cache is missed/revalidated)
    mock_get_user.assert_awaited()


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
async def test_update_user_not_found(mock_get_user):
    """Test updating a user that does not exist."""
    user_id = "non_existent_user"
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_kv = MagicMock()
    mock_env.DB = mock_db
    mock_env.KV = mock_kv

    # Mock get_user to raise NotFoundError
    mock_get_user.side_effect = NotFoundError(f"User not found: {user_id}")

    # Data to update (doesn't matter)
    update_data = {"bio": "Does not matter"}

    # Call update_user and expect NotFoundError
    with pytest.raises(NotFoundError) as excinfo:
        await update_user(mock_env, user_id, update_data)

    assert f"User not found: {user_id}" in str(excinfo.value)
    # Ensure DB/KV were not touched
    mock_db.prepare.assert_not_called()
    mock_kv.delete.assert_not_called()


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
async def test_update_user_invalid_data(mock_get_user):
    """Test updating a user with invalid data keys."""
    user_id = "user_with_invalid_update"
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_kv = MagicMock()
    mock_env.DB = mock_db
    mock_env.KV = mock_kv

    # Mock existing user
    existing_user_data = {
        "id": user_id,
        "telegram_id": 66666,
        "full_name": "Test",
        "birth_date": date(2000, 1, 1),
        "gender": "other",  # Add required fields
    }
    existing_user = User(**existing_user_data)
    mock_get_user.return_value = existing_user  # Only needs to be called once for check

    # Invalid data (field does not exist in User model)
    update_data = {"non_existent_field": "some_value"}

    # Call update_user and expect ValidationError
    with pytest.raises(ValidationError) as excinfo:
        await update_user(mock_env, user_id, update_data)

    # Check that the validation within update_user caught the bad field
    assert "Invalid update fields" in str(excinfo.value)
    # Ensure DB/KV were not touched
    mock_db.prepare.assert_not_called()
    mock_kv.delete.assert_not_called()


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
async def test_update_user_db_error(mock_get_user):
    """Test handling of a database error during user update."""
    user_id = "user_db_error"
    mock_env = MagicMock(spec=Settings)
    mock_db = MagicMock()
    mock_kv = MagicMock()
    mock_env.DB = mock_db
    mock_env.KV = mock_kv

    # Mock existing user
    existing_user_data = {
        "id": user_id,
        "telegram_id": 77777,
        "full_name": "DB Error User",
        "birth_date": date(1999, 12, 31),
        "gender": "male",  # Add required fields
    }
    existing_user = User(**existing_user_data)
    mock_get_user.return_value = existing_user  # First call works

    # Mock D1 update operation to raise an exception
    mock_update_stmt = MagicMock()
    mock_update_stmt.bind = MagicMock(return_value=mock_update_stmt)
    mock_update_stmt.run = AsyncMock(side_effect=Exception("D1 unavailable"))
    mock_db.prepare = MagicMock(return_value=mock_update_stmt)

    # Valid data
    update_data = {"bio": "Trying to update"}

    # Call update_user and expect ValidationError (wrapping the DB error)
    with pytest.raises(ValidationError) as excinfo:
        await update_user(mock_env, user_id, update_data)

    assert f"Database error updating user: {user_id}" in str(excinfo.value)
    # Ensure get_user was called for the initial check
    mock_get_user.assert_awaited_once_with(mock_env, user_id)
    # Ensure KV delete was NOT called because the transaction failed
    mock_kv.delete.assert_not_called()


# --- update_user_location Tests ---


@pytest.mark.asyncio
@patch("src.services.user_service.update_user")  # Mock the underlying update_user
async def test_update_user_location_success(mock_update_user):
    """Test successfully updating a user's location."""
    user_id = "user_location_update"
    mock_env = MagicMock(spec=Settings)  # Not strictly needed as update_user is mocked

    # Use the correct Location model
    location_data_dict = {"latitude": 12.34, "longitude": 56.78}
    location_obj = Location(**location_data_dict)

    # Define what the mocked update_user should return
    expected_updated_user = User(
        id=user_id,
        telegram_id=88888,
        full_name="Location User",
        birth_date=date(1992, 2, 2),
        gender="female",
        latitude=location_obj.latitude,
        longitude=location_obj.longitude,  # Use attributes
    )
    mock_update_user.return_value = expected_updated_user

    from src.services.user_service import update_user_location

    result = await update_user_location(mock_env, user_id, location_obj)

    # Assertions
    # Check update_user was called correctly
    mock_update_user.assert_awaited_once()
    call_args = mock_update_user.await_args
    assert call_args[0][1] == user_id  # Check user_id
    assert isinstance(call_args[0][2], dict)  # Check 3rd arg is dict
    assert "location" in call_args[0][2]  # Check 'location' key exists
    location_update_dict = call_args[0][2]["location"]
    assert isinstance(location_update_dict, dict)
    assert location_update_dict["latitude"] == location_obj.latitude
    assert location_update_dict["longitude"] == location_obj.longitude
    # Check that the result from update_user was returned
    assert result == expected_updated_user


@pytest.mark.asyncio
@patch("src.services.user_service.update_user")  # Mock the underlying update_user
async def test_update_user_location_error_propagation(mock_update_user):
    """Test that errors from update_user are propagated by update_user_location."""
    user_id = "user_location_error"
    mock_env = MagicMock(spec=Settings)
    location_obj = Location(latitude=-20.5, longitude=175.0)

    # Configure the mocked update_user to raise an error (e.g., NotFoundError)
    mock_update_user.side_effect = NotFoundError(f"User not found: {user_id}")

    # Call the function being tested and expect the error
    from src.services.user_service import update_user_location

    with pytest.raises(NotFoundError) as excinfo:
        await update_user_location(mock_env, user_id, location_obj)

    # Assertions
    assert f"User not found: {user_id}" in str(excinfo.value)
    # Check update_user was called correctly even though it raised error
    mock_update_user.assert_awaited_once()
    call_args = mock_update_user.await_args
    assert call_args[0][1] == user_id  # Check user_id
    assert isinstance(call_args[0][2], dict)  # Check 3rd arg is dict
    assert "location" in call_args[0][2]  # Check 'location' key exists
    location_update_dict = call_args[0][2]["location"]
    assert isinstance(location_update_dict, dict)
    assert location_update_dict["latitude"] == location_obj.latitude
    assert location_update_dict["longitude"] == location_obj.longitude


# --- update_user_preferences Tests ---


@pytest.mark.asyncio
@patch("src.services.user_service.update_user")
async def test_update_user_preferences_success(mock_update_user):
    """Test successfully updating user preferences."""
    user_id = "prefs_update_user"
    mock_env = MagicMock(spec=Settings)
    preferences_data = {
        "min_age": 25,
        "max_age": 40,
        "gender_preference": "female",
        "max_distance": 100,
        "relationship_type": [RelationshipType.LONG_TERM, RelationshipType.FRIENDSHIP],  # Use Enum
    }
    preferences_obj = Preferences(**preferences_data)

    # Mock return value for the underlying update_user
    expected_updated_user = User(
        id=user_id,
        telegram_id=99999,
        full_name="Prefs User",
        birth_date=date(1990, 5, 15),
        gender="male",
        preferences=preferences_obj,  # Ensure the updated prefs are returned
    )
    mock_update_user.return_value = expected_updated_user

    from src.services.user_service import update_user_preferences

    result = await update_user_preferences(mock_env, user_id, preferences_obj)

    # Assert update_user was called correctly
    mock_update_user.assert_awaited_once()
    call_args = mock_update_user.await_args
    assert call_args[0][1] == user_id
    assert "preferences" in call_args[0][2]
    # Compare the serialized dicts, excluding potential dynamic fields if any
    # Use model_dump(mode="json") as done in the actual function
    assert call_args[0][2]["preferences"] == preferences_obj.model_dump(mode="json")

    # Assert the result is correct
    assert result == expected_updated_user


@pytest.mark.asyncio
@patch("src.services.user_service.update_user")
async def test_update_user_preferences_error(mock_update_user):
    """Test error propagation when updating user preferences."""
    user_id = "prefs_error_user"
    mock_env = MagicMock(spec=Settings)
    preferences_obj = Preferences(min_age=30, max_age=50)  # Simple prefs

    # Mock update_user to raise an error
    mock_update_user.side_effect = ValidationError("DB update failed")

    from src.services.user_service import update_user_preferences

    with pytest.raises(ValidationError) as excinfo:
        await update_user_preferences(mock_env, user_id, preferences_obj)

    assert "DB update failed" in str(excinfo.value)

    # Assert update_user was called correctly despite error
    mock_update_user.assert_awaited_once()
    call_args = mock_update_user.await_args
    assert call_args[0][1] == user_id
    assert "preferences" in call_args[0][2]
    assert call_args[0][2]["preferences"] == preferences_obj.model_dump(mode="json")


# --- delete_user Tests ---


@pytest.mark.asyncio
@patch("src.services.user_service.logger.info")
@patch("src.services.user_service.get_user")  # <-- Patch get_user
async def test_delete_user_success(mock_get_user, mock_log_info):
    """Test successfully deleting a user."""
    user_id = "delete_me"
    mock_env = MagicMock(spec=Settings)
    mock_env.DB = MagicMock()  # Mock the DB attribute itself
    mock_env.KV = MagicMock()  # Mock the KV attribute

    # Mock get_user to return a user, simulating user exists
    mock_get_user.return_value = MagicMock(spec=User)

    # Mock D1 interaction for DELETE
    mock_run_result = MagicMock()
    mock_run_result.meta = {"changes": 1}  # Simulate 1 row deleted
    mock_bind = AsyncMock()
    mock_bind.run.return_value = mock_run_result
    mock_prepare = MagicMock()
    mock_prepare.bind.return_value = mock_bind
    mock_env.DB.prepare.return_value = mock_prepare

    # Mock KV interaction
    mock_env.KV.delete = AsyncMock()

    await delete_user(mock_env, user_id)

    # Assert D1 was called
    mock_env.DB.prepare.assert_called_once_with("DELETE FROM users WHERE id = ?")
    mock_prepare.bind.assert_called_once_with(user_id)
    mock_bind.run.assert_awaited_once()

    # Assert KV was called for both keys
    expected_user_key = f"user:{user_id}"
    expected_location_key = f"user:location:{user_id}"
    mock_env.KV.delete.assert_has_awaits([call(expected_user_key), call(expected_location_key)], any_order=True)
    mock_log_info.assert_called_with("User deleted from D1 and KV cache invalidated", user_id=user_id)


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")  # <-- Patch get_user
async def test_delete_user_not_found(mock_get_user):
    """Test deleting a user that does not exist."""
    user_id = "not_found_delete"
    mock_env = MagicMock(spec=Settings)
    mock_env.DB = MagicMock()  # Mock the DB attribute itself

    # Mock get_user to raise NotFoundError
    mock_get_user.side_effect = NotFoundError(f"User not found: {user_id}")

    # Mock KV (shouldn't be called)
    mock_env.KV = MagicMock()
    mock_env.KV.delete = AsyncMock()

    with pytest.raises(NotFoundError) as excinfo:
        await delete_user(mock_env, user_id)

    # Assertions
    assert f"User not found: {user_id}" in str(excinfo.value)
    # Assert get_user was called
    mock_get_user.assert_called_once_with(mock_env, user_id)
    # Assert KV delete was NOT called
    mock_env.KV.delete.assert_not_awaited()


@pytest.mark.asyncio
@patch("src.services.user_service.logger.error")
@patch("src.services.user_service.get_user")  # <-- Patch get_user
async def test_delete_user_db_error(mock_get_user, mock_log_error):
    """Test handling a database error during deletion."""
    user_id = "db_error_delete"
    mock_env = MagicMock(spec=Settings)
    mock_env.DB = MagicMock()  # Mock the DB attribute itself
    mock_env.KV = MagicMock()  # Mock the KV attribute
    db_error = Exception("D1 connection failed")

    # Mock get_user to return a user, simulating user exists
    mock_get_user.return_value = MagicMock(spec=User)

    # Mock D1 interaction to raise an error
    mock_bind = AsyncMock()
    mock_bind.run.side_effect = db_error
    mock_prepare = MagicMock()
    mock_prepare.bind.return_value = mock_bind
    mock_env.DB.prepare.return_value = mock_prepare

    # Mock KV (shouldn't be called)
    mock_env.KV.delete = AsyncMock()

    with pytest.raises(ValidationError) as excinfo:
        await delete_user(mock_env, user_id)

    assert f"Database error deleting user: {user_id}" in str(excinfo.value)
    assert excinfo.value.__cause__ is db_error  # Check error chaining

    # Assert get_user was called
    mock_get_user.assert_called_once_with(mock_env, user_id)
    # Assert D1 DELETE was attempted
    mock_env.DB.prepare.assert_called_once_with("DELETE FROM users WHERE id = ?")
    mock_prepare.bind.assert_called_once_with(user_id)
    mock_bind.run.assert_awaited_once()
    # Assert KV delete was NOT called
    mock_env.KV.delete.assert_not_awaited()
    mock_log_error.assert_called_once_with(
        "D1 database delete error for delete_user", user_id=user_id, error=str(db_error), exc_info=True
    )


# --- Test get_user_profile_photo_url ---


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
async def test_get_user_profile_photo_url_success(mock_get_user):
    """Test successfully getting the profile photo URL for a user with a photo."""
    user_id = "user_with_photo"
    mock_env = MagicMock(spec=Settings)
    mock_env.R2 = MagicMock()  # Mock R2 storage

    # Mock get_user to return a user with a photo key
    mock_user = MagicMock(spec=User)
    mock_user.profile_photo_key = f"photos/{user_id}/profile.jpg"
    mock_get_user.return_value = mock_user

    # Define the expected URL (adjust based on actual URL structure if needed)
    expected_url = f"https://pub-your-r2-public-bucket-url.r2.dev/{mock_user.profile_photo_key}"
    # In a real scenario, this base URL would come from settings or a constant

    # Mock env.R2.object().key to return the key for constructing the URL
    # Note: The actual function might directly construct the URL or use other R2 methods
    # We'll adjust this mock based on the get_user_profile_photo_url implementation

    # Assuming the function constructs the URL directly from the key and a base URL
    # If it uses R2 head() or get(), we'll need to mock those instead.

    # Let's assume for now the function needs the base URL from env
    mock_env.R2_PUBLIC_URL = "https://pub-your-r2-public-bucket-url.r2.dev"

    actual_url = await get_user_profile_photo_url(mock_env, user_id)

    assert actual_url == expected_url
    mock_get_user.assert_called_once_with(mock_env, user_id)


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
async def test_get_user_profile_photo_url_no_key(mock_get_user):
    """Test getting the profile photo URL when the user has no photo key."""
    user_id = "user_no_photo"
    mock_env = MagicMock(spec=Settings)

    # Mock get_user to return a user with no photo key
    mock_user = MagicMock(spec=User)
    mock_user.profile_photo_key = None  # Explicitly set to None
    mock_get_user.return_value = mock_user

    # R2_PUBLIC_URL shouldn't matter here, but mock it for completeness
    mock_env.R2_PUBLIC_URL = "https://pub-your-r2-public-bucket-url.r2.dev"

    actual_url = await get_user_profile_photo_url(mock_env, user_id)

    assert actual_url is None
    mock_get_user.assert_called_once_with(mock_env, user_id)


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
async def test_get_user_profile_photo_url_not_found(mock_get_user):
    """Test getting the profile photo URL when the user is not found."""
    user_id = "user_does_not_exist"
    mock_env = MagicMock(spec=Settings)

    # Mock get_user to raise NotFoundError
    not_found_error = NotFoundError(f"User not found: {user_id}")
    mock_get_user.side_effect = not_found_error

    with pytest.raises(NotFoundError) as excinfo:
        await get_user_profile_photo_url(mock_env, user_id)

    assert excinfo.value is not_found_error  # Ensure the original exception is propagated
    mock_get_user.assert_called_once_with(mock_env, user_id)


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
@patch("src.services.user_service.logger.error")
async def test_get_user_profile_photo_url_missing_r2_url(mock_log_error, mock_get_user):
    """Test getting the profile photo URL when R2_PUBLIC_URL is not configured."""
    user_id = "user_with_photo_no_r2_url"
    mock_env = MagicMock(spec=Settings)

    # Mock get_user to return a user with a photo key
    mock_user = MagicMock(spec=User)
    mock_user.profile_photo_key = f"photos/{user_id}/profile.jpg"
    mock_get_user.return_value = mock_user

    # Mock env.R2_PUBLIC_URL to be None or missing
    # If Settings uses Pydantic, accessing a non-existent attr might raise AttributeError
    # Let's explicitly set it to None to simulate it not being configured.
    mock_env.R2_PUBLIC_URL = None

    with pytest.raises(ValidationError) as excinfo:
        await get_user_profile_photo_url(mock_env, user_id)

    assert "R2 public URL is not configured" in str(excinfo.value)
    mock_get_user.assert_called_once_with(mock_env, user_id)
    # Assert logger.error was called
    mock_log_error.assert_called_once_with("R2_PUBLIC_URL environment variable is not set.", user_id=user_id)


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")
@patch("src.services.user_service.logger.error")
async def test_get_user_profile_photo_url_unexpected_error(mock_log_error, mock_get_user):
    """Test getting the profile photo URL when an unexpected error occurs."""
    user_id = "user_unexpected_error"
    mock_env = MagicMock(spec=Settings)
    original_error = Exception("Something broke")

    # Mock get_user to raise an unexpected error
    mock_get_user.side_effect = original_error

    with pytest.raises(ValidationError) as excinfo:
        await get_user_profile_photo_url(mock_env, user_id)

    assert f"Failed to get profile photo URL for user {user_id}" in str(excinfo.value)
    assert excinfo.value.__cause__ is original_error  # Check error chaining
    mock_get_user.assert_called_once_with(mock_env, user_id)
    # Assert logger.error was called with the correct message and original error
    mock_log_error.assert_called_once_with(
        "Unexpected error getting profile photo URL", user_id=user_id, error=str(original_error), exc_info=True
    )


# --- Test update_user (focus on profile_photo_key) ---


@pytest.mark.asyncio
@patch("src.services.user_service.get_user")  # Mock both initial and final get_user
async def test_update_user_photos(mock_get_user):
    """Test successfully updating the photos list via update_user."""
    user_id = "user_update_photos"
    old_photos = ["photos/old_profile.jpg"]
    new_photos = [f"photos/{user_id}/new_profile.jpg", f"photos/{user_id}/another.jpg"]
    mock_env = MagicMock(spec=Settings)
    mock_env.DB = MagicMock()
    mock_env.KV = MagicMock()

    # Mocks are attached directly to mock_env, no need for @patch args
    # --- Simplified D1 Mock Setup ---
    mock_run = AsyncMock()  # The final async call we await
    mock_bind_result = MagicMock()  # The object returned by bind()
    mock_bind_result.run = mock_run  # This object has the run() method

    mock_prepare_result = MagicMock()  # The object returned by prepare()
    # Configure the bind method on the object returned by prepare()
    mock_prepare_result.bind = MagicMock(return_value=mock_bind_result)

    # Configure the DB's prepare method to return our prepared statement mock
    mock_env.DB.prepare = MagicMock(return_value=mock_prepare_result)
    # --- End Simplified D1 Mock Setup ---

    mock_kv_delete = AsyncMock()
    mock_env.KV.delete = mock_kv_delete

    # 1. Mock initial get_user call (inside update_user)
    initial_user = MagicMock(spec=User)
    initial_user.id = user_id
    initial_user.photos = old_photos
    # Simulate model_dump needed for potential diffing (though update_user doesn't diff here)
    initial_user.model_dump.return_value = {"id": user_id, "photos": old_photos}

    # 2. Mock final get_user call (at the end of update_user to return updated user)
    final_user = MagicMock(spec=User)
    final_user.id = user_id
    final_user.photos = new_photos

    # Configure mock_get_user to return initial then final user
    mock_get_user.side_effect = [initial_user, final_user]

    # Data to update
    update_data = {"photos": new_photos}

    updated_user_result = await update_user(mock_env, user_id, update_data)

    # Assertions
    # Check DB prepare call
    mock_env.DB.prepare.assert_called_once()  # Check prepare was called on the DB mock
    call_args, _ = mock_env.DB.prepare.call_args
    assert "photos = ?" in call_args[0]  # Check if 'photos' is in the SQL SET clause
    assert "updated_at = ?" in call_args[0]
    assert "WHERE id = ?" in call_args[0]

    # Check bind call (on the object returned by prepare)
    mock_prepare_result.bind.assert_called_once()
    bind_args, _ = mock_prepare_result.bind.call_args
    # bind_args[0] = photos value (list)
    # bind_args[1] = updated_at value (datetime)
    # bind_args[2] = user_id value (string)
    assert len(bind_args) == 3
    assert bind_args[0] == new_photos  # Check for the list itself, not JSON
    assert isinstance(bind_args[1], datetime)  # Check the type of the timestamp
    assert bind_args[2] == user_id

    # Check run call (on the object returned by bind)
    mock_run.assert_called_once_with()  # .run() takes no arguments

    # Check cache invalidation (asserting on the mock attached to mock_env.KV)
    mock_kv_delete.assert_called_once_with(f"user:{user_id}")

    # Check get_user calls
    assert mock_get_user.call_count == 2
    mock_get_user.assert_any_call(mock_env, user_id)  # Called twice with same args

    # Check returned user object
    assert updated_user_result is final_user
    assert updated_user_result.photos == new_photos
