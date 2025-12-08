import importlib
import sys
from unittest.mock import MagicMock, patch

import pytest

# Define fixtures to restore real modules BEFORE importing them at top level if possible,
# or just import them inside the tests/fixtures after restoration.


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules, not the mocks from conftest."""
    # List of modules to restore - order matters for dependencies
    modules_to_restore = [
        "src.services",
        "src.services.user_service",
        "src.models.user",
        "src.utils.errors",
        "src.utils.cache",
        "src.utils.database",
        "src.config",
    ]

    saved_modules = {}
    for mod_name in modules_to_restore:
        saved_modules[mod_name] = sys.modules.get(mod_name)
        if mod_name in sys.modules:
            del sys.modules[mod_name]

    # Re-import real modules
    try:
        # Dependencies first
        import src.utils.errors

        importlib.reload(src.utils.errors)

        import src.config

        importlib.reload(src.config)

        import src.utils.cache

        importlib.reload(src.utils.cache)

        import src.utils.database

        importlib.reload(src.utils.database)

        import src.models.user

        importlib.reload(src.models.user)

        import src.services

        importlib.reload(src.services)

        import src.services.user_service

        importlib.reload(src.services.user_service)
    except ImportError as e:
        print(f"Error reloading modules: {e}")

    yield

    # Restore original modules (mocks)
    for mod_name, saved_mod in saved_modules.items():
        if saved_mod:
            sys.modules[mod_name] = saved_mod
        else:
            if mod_name in sys.modules:
                del sys.modules[mod_name]


@pytest.fixture
def user_service_module(restore_real_modules):
    import src.services.user_service

    return src.services.user_service


@pytest.fixture
def errors_module(restore_real_modules):
    import src.utils.errors

    return src.utils.errors


@pytest.fixture
def user_model(restore_real_modules):
    from src.models.user import User

    return User


@pytest.fixture
def location_model(restore_real_modules):
    from src.models.user import Location

    return Location


@pytest.fixture
def preferences_model(restore_real_modules):
    from src.models.user import Preferences

    return Preferences


@pytest.fixture
def mock_cache_module(user_service_module):
    # Patch the objects on the RELOADED module
    # Note: user_service_module imports these from src.utils.cache.
    # We must patch the NAMES in user_service_module.
    with (
        patch.object(user_service_module, "get_cache_model") as mock_get,
        patch.object(user_service_module, "set_cache") as mock_set,
        patch.object(user_service_module, "delete_cache") as mock_delete,
    ):
        yield {"get_model": mock_get, "set": mock_set, "delete": mock_delete}


@pytest.fixture
def mock_db_module(user_service_module):
    with patch.object(user_service_module, "execute_query") as mock_execute:
        yield mock_execute


@pytest.fixture
def sample_user(user_model, location_model, preferences_model):
    return user_model(
        id="123",
        username="testuser",
        email="test@example.com",
        first_name="Test",
        last_name="User",
        age=25,
        gender="male",
        location=location_model(latitude=0.0, longitude=0.0, city="Test City", country="Test Country"),
        preferences=preferences_model(),
        interests=["coding", "testing"],
    )


class TestUserService:
    def test_get_user_cache_hit(self, user_service_module, mock_cache_module, sample_user):
        """Test get_user when user is in cache."""
        mock_cache_module["get_model"].return_value = sample_user

        user = user_service_module.get_user("123")

        assert user == sample_user
        mock_cache_module["get_model"].assert_called_once()
        mock_cache_module["set"].assert_not_called()

    def test_get_user_db_hit(self, user_service_module, mock_cache_module, mock_db_module, sample_user):
        """Test get_user when user is not in cache but in DB."""
        mock_cache_module["get_model"].return_value = None

        # Mock DB response
        mock_result = MagicMock()
        mock_result.data = [sample_user.model_dump()]
        mock_db_module.return_value = mock_result

        user = user_service_module.get_user("123")

        assert user.id == sample_user.id
        mock_db_module.assert_called_once()
        mock_cache_module["set"].assert_called_once()

    def test_get_user_not_found(self, user_service_module, errors_module, mock_cache_module, mock_db_module):
        """Test get_user when user is not found."""
        mock_cache_module["get_model"].return_value = None

        mock_result = MagicMock()
        mock_result.data = []
        mock_db_module.return_value = mock_result

        with pytest.raises(errors_module.NotFoundError):
            user_service_module.get_user("123")

    def test_create_user_success(
        self, user_service_module, errors_module, mock_cache_module, mock_db_module, sample_user
    ):
        """Test create_user success."""
        # Mock get_user to raise NotFoundError (user doesn't exist)
        # Note: We must patch 'get_user' in the module where create_user is defined.
        with patch.object(user_service_module, "get_user", side_effect=errors_module.NotFoundError("User not found")):
            mock_result = MagicMock()
            mock_result.data = [sample_user.model_dump()]
            mock_db_module.return_value = mock_result

            user = user_service_module.create_user(sample_user)

            assert user.id == sample_user.id
            mock_db_module.assert_called_once()
            mock_cache_module["set"].assert_called_once()

    def test_create_user_already_exists(self, user_service_module, errors_module, sample_user):
        """Test create_user when user already exists."""
        with patch.object(user_service_module, "get_user", return_value=sample_user):
            with pytest.raises(errors_module.ValidationError):
                user_service_module.create_user(sample_user)

    def test_create_user_failure(
        self, user_service_module, errors_module, mock_cache_module, mock_db_module, sample_user
    ):
        """Test create_user DB failure."""
        with patch.object(user_service_module, "get_user", side_effect=errors_module.NotFoundError("User not found")):
            mock_result = MagicMock()
            mock_result.data = []  # Failed to insert
            mock_db_module.return_value = mock_result

            with pytest.raises(errors_module.ValidationError):
                user_service_module.create_user(sample_user)

    def test_update_user_success(self, user_service_module, mock_cache_module, mock_db_module, sample_user):
        """Test update_user success."""
        with patch.object(user_service_module, "get_user", return_value=sample_user):
            mock_result = MagicMock()
            mock_result.data = [sample_user.model_dump()]
            mock_db_module.return_value = mock_result

            user = user_service_module.update_user(sample_user.id, sample_user.model_dump())

            assert user.id == sample_user.id
            mock_db_module.assert_called_once()
            # Verify cache invalidation/update
            mock_cache_module["delete"].assert_called()
            mock_cache_module["set"].assert_called()

    def test_update_user_not_found(self, user_service_module, errors_module, sample_user):
        """Test update_user when user doesn't exist."""
        with patch.object(user_service_module, "get_user", side_effect=errors_module.NotFoundError("User not found")):
            with pytest.raises(errors_module.NotFoundError):
                user_service_module.update_user(sample_user.id, sample_user.model_dump())

    def test_delete_user(self, user_service_module, mock_cache_module, mock_db_module, sample_user):
        """Test delete_user success."""
        with patch.object(user_service_module, "get_user", return_value=sample_user):
            mock_result = MagicMock()
            mock_result.data = [{"id": "123"}]
            mock_db_module.return_value = mock_result

            user_service_module.delete_user("123")

            mock_db_module.assert_called_once()
            mock_cache_module["delete"].assert_called()

    def test_delete_user_failure(self, user_service_module, errors_module, mock_db_module, sample_user):
        """Test delete_user DB failure."""
        with patch.object(user_service_module, "get_user", return_value=sample_user):
            mock_result = MagicMock()
            mock_result.data = []
            mock_db_module.return_value = mock_result

            with pytest.raises(errors_module.ValidationError):
                user_service_module.delete_user("123")

    def test_get_user_location_cache_hit(self, user_service_module, mock_cache_module, location_model):
        """Test get_user_location cache hit."""
        location = location_model(latitude=1.0, longitude=1.0, city="City", country="Country")
        mock_cache_module["get_model"].return_value = location

        result = user_service_module.get_user_location("123")

        assert result == location
        mock_cache_module["get_model"].assert_called_once()

    def test_get_user_location_cache_miss(self, user_service_module, mock_cache_module, sample_user):
        """Test get_user_location cache miss."""
        mock_cache_module["get_model"].return_value = None

        with patch.object(user_service_module, "get_user", return_value=sample_user):
            result = user_service_module.get_user_location("123")

            assert result == sample_user.location
            mock_cache_module["set"].assert_called_once()

    def test_update_user_location_helper(
        self, user_service_module, mock_cache_module, mock_db_module, sample_user, location_model
    ):
        """Test update_user_location."""
        new_location = location_model(latitude=2.0, longitude=2.0, city="New City", country="New Country")

        with patch.object(user_service_module, "get_user", return_value=sample_user):
            mock_result = MagicMock()
            mock_result.data = [sample_user.model_dump()]  # Return user data, but we care about execution
            mock_db_module.return_value = mock_result

            user_service_module.update_user_location("123", new_location)

            mock_db_module.assert_called_once()
            # Verify cache update for location
            # Note: exact calls depend on implementation details (e.g. key format)
            assert mock_cache_module["set"].call_count >= 1

    def test_update_user_preferences(self, user_service_module, mock_db_module, sample_user, preferences_model):
        """Test update_user_preferences."""
        new_prefs = preferences_model(min_age=20, max_age=30)

        with patch.object(user_service_module, "get_user", return_value=sample_user):
            mock_result = MagicMock()
            mock_result.data = [sample_user.model_dump()]
            mock_db_module.return_value = mock_result

            user_service_module.update_user_preferences("123", new_prefs)

            mock_db_module.assert_called_once()

    def test_update_last_active(self, user_service_module, mock_db_module, sample_user):
        """Test update_last_active."""
        with patch.object(user_service_module, "get_user", return_value=sample_user):
            mock_result = MagicMock()
            mock_result.data = [sample_user.model_dump()]
            mock_db_module.return_value = mock_result

            user_service_module.update_last_active("123")

            mock_db_module.assert_called_once()

    def test_update_user_location_invalidation(
        self, user_service_module, mock_cache_module, mock_db_module, sample_user, location_model
    ):
        """Test that updating user location invalidates/updates relevant caches."""
        new_location = location_model(latitude=2.0, longitude=2.0, city="New City", country="New Country")

        with patch.object(user_service_module, "get_user", return_value=sample_user):
            mock_result = MagicMock()
            mock_result.data = [sample_user.model_dump()]
            mock_db_module.return_value = mock_result

            user_service_module.update_user_location("123", new_location)

            # Should update location cache and invalidate user cache (or update it)
            assert mock_cache_module["set"].called or mock_cache_module["delete"].called
