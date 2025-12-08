import importlib
import sys
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest


# Define fixtures to restore real modules
@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules, not the mocks from conftest."""
    modules_to_restore = [
        "src.services",
        "src.services.matching_service",
        "src.services.user_service",
        "src.models.user",
        "src.models.match",
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

        import src.models.match

        importlib.reload(src.models.match)

        import src.services

        importlib.reload(src.services)

        import src.services.user_service

        importlib.reload(src.services.user_service)

        import src.services.matching_service

        importlib.reload(src.services.matching_service)

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
def matching_service_module(restore_real_modules):
    import src.services.matching_service

    return src.services.matching_service


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
def match_model(restore_real_modules):
    from src.models.match import Match

    return Match


@pytest.fixture
def mock_cache_module(matching_service_module):
    # Patch cache functions in matching_service
    # Note: delete_cache is NOT imported in matching_service global scope,
    # it is imported inside clear_potential_matches_cache and clear_user_matches_cache.
    # However, get_cache and set_cache ARE imported at top level.
    with (
        patch.object(matching_service_module, "get_cache") as mock_get,
        patch.object(matching_service_module, "set_cache") as mock_set,
    ):
        yield {"get": mock_get, "set": mock_set}


@pytest.fixture
def mock_db_module(matching_service_module):
    with patch.object(matching_service_module, "execute_query") as mock_execute:
        yield mock_execute


@pytest.fixture
def sample_users(user_model, location_model, preferences_model):
    user1 = user_model(
        id="user1",
        username="user1",
        email="user1@example.com",
        first_name="User",
        last_name="One",
        age=25,
        gender="male",
        location=location_model(latitude=40.7128, longitude=-74.0060, city="NY", country="USA"),
        preferences=preferences_model(min_age=20, max_age=30, gender_preference=["female"], max_distance=50),
        interests=["coding", "movies"],
        photos=["photo1.jpg"],
        is_active=True,
        is_profile_complete=True,
    )

    user2 = user_model(
        id="user2",
        username="user2",
        email="user2@example.com",
        first_name="User",
        last_name="Two",
        age=24,
        gender="female",
        location=location_model(latitude=40.7300, longitude=-74.0000, city="NY", country="USA"),
        preferences=preferences_model(min_age=22, max_age=30, gender_preference=["male"], max_distance=50),
        interests=["coding", "books"],
        photos=["photo2.jpg"],
        is_active=True,
        is_profile_complete=True,
    )

    return user1, user2


class TestMatchingService:
    def test_calculate_match_score(self, matching_service_module, sample_users):
        user1, user2 = sample_users
        score = matching_service_module.calculate_match_score(user1, user2)

        assert score.total > 0
        assert score.location > 0  # Close by
        assert score.interests > 0  # Both like coding
        assert score.preferences > 0  # Match preferences

    def test_is_potential_match_success(self, matching_service_module, sample_users):
        user1, user2 = sample_users
        is_match = matching_service_module.is_potential_match(user1, user2)
        assert is_match is True

    def test_is_potential_match_age_mismatch(self, matching_service_module, sample_users):
        user1, user2 = sample_users
        user2.age = 50  # Too old for user1 (max 30)

        is_match = matching_service_module.is_potential_match(user1, user2)
        assert is_match is False

    def test_is_potential_match_distance_mismatch(self, matching_service_module, sample_users):
        user1, user2 = sample_users
        # Set user2 far away
        user2.location.latitude = 0.0
        user2.location.longitude = 0.0

        is_match = matching_service_module.is_potential_match(user1, user2)
        assert is_match is False

    def test_get_potential_matches_cache_hit(
        self, matching_service_module, mock_cache_module, mock_db_module, sample_users
    ):
        user1, user2 = sample_users

        # Mock get_user to return user1
        with patch.object(matching_service_module, "get_user", return_value=user1) as mock_get_user:
            # Mock cache hit
            mock_cache_module["get"].return_value = "user2"

            # Mock get_user for potential match
            mock_get_user.side_effect = [user1, user2]

            matches = matching_service_module.get_potential_matches("user1")

            assert len(matches) == 1
            assert matches[0].id == "user2"
            mock_cache_module["get"].assert_called_once()
            mock_db_module.assert_not_called()

    def test_get_potential_matches_db_hit(
        self, matching_service_module, mock_cache_module, mock_db_module, sample_users
    ):
        user1, user2 = sample_users

        with patch.object(matching_service_module, "get_user", return_value=user1):
            # Mock cache miss
            mock_cache_module["get"].return_value = None

            # Mock DB response for potential matches
            mock_result = MagicMock()
            mock_result.data = [user2.model_dump()]
            mock_db_module.return_value = mock_result

            # Mock get_user_matches to return empty
            with patch.object(matching_service_module, "get_user_matches", return_value=[]):
                matches = matching_service_module.get_potential_matches("user1")

                assert len(matches) == 1
                assert matches[0].id == "user2"
                mock_db_module.assert_called()
                mock_cache_module["set"].assert_called()

    def test_create_match_success(self, matching_service_module, mock_db_module, mock_cache_module, sample_users):
        """Test create_match success flow."""
        user1, user2 = sample_users

        # We need to mock get_user
        # And since clear_potential_matches_cache imports delete_cache locally, we need to mock sys.modules["src.utils.cache"].delete_cache?
        # Or patch src.utils.cache.delete_cache

        with patch("src.utils.cache.delete_cache") as mock_delete_cache:
            mock_cache_module["delete"] = mock_delete_cache

            with patch.object(matching_service_module, "get_user", side_effect=[user1, user2]):
                # 1. Check existing match (returns empty)
                mock_result_existing = MagicMock()
                mock_result_existing.data = []

                # 2. Insert match (returns data)
                mock_result_insert = MagicMock()
                mock_result_insert.data = [{"id": "match_123"}]  # The implementation checks if result.data is truthy

                mock_db_module.side_effect = [mock_result_existing, mock_result_insert]

                match = matching_service_module.create_match(user1.id, user2.id)

                assert match.user1_id == user1.id
                assert match.user2_id == user2.id
                assert match.score.total > 0

                # Verify DB calls
                assert mock_db_module.call_count == 2

                # Verify cache calls
                mock_cache_module["set"].assert_called()
                mock_delete_cache.assert_called()  # clear_potential_matches_cache calls this

    def test_create_match_already_exists(self, matching_service_module, mock_db_module, sample_users):
        user1, user2 = sample_users

        with patch.object(matching_service_module, "get_user", side_effect=[user1, user2]):
            # Mock existing match found
            existing_match_data = {
                "id": "existing_match",
                "user1_id": user1.id,
                "user2_id": user2.id,
                "status": "pending",
                "score": {"total": 0.9, "location": 1.0, "interests": 0.8, "preferences": 0.9},
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
            }
            mock_result_existing = MagicMock()
            mock_result_existing.data = [existing_match_data]

            mock_db_module.return_value = mock_result_existing

            match = matching_service_module.create_match(user1.id, user2.id)

            assert match.id == "existing_match"
            # Should only query once
            mock_db_module.assert_called_once()

    def test_update_match(self, matching_service_module, mock_db_module, mock_cache_module, sample_users, match_model):
        user1, user2 = sample_users
        match_id = "match_123"

        # Mock get_match (db hit)
        match_data = {
            "id": match_id,
            "user1_id": user1.id,
            "user2_id": user2.id,
            "status": "pending",
            "score": {"total": 0.8, "location": 1.0, "interests": 0.5, "preferences": 0.9},
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
        }

        # get_match -> select query
        mock_result_select = MagicMock()
        mock_result_select.data = [match_data]

        # update_match -> update query
        mock_result_update = MagicMock()
        mock_result_update.data = [match_data]  # Return data is checked

        # get_match (reload) -> select query
        # But wait, update_match calls get_match again to return the updated object?
        # Let's check implementation.
        # Yes: updated_match = get_match(match_id)

        # So sequence of DB calls:
        # 1. get_match (inside update_match) -> select
        # 2. execute_query (update) -> update
        # 3. get_match (reload) -> select

        # Mock cache miss for get_match
        mock_cache_module["get"].return_value = None

        with patch("src.utils.cache.delete_cache") as mock_delete_cache:
            mock_cache_module["delete"] = mock_delete_cache

            mock_db_module.side_effect = [mock_result_select, mock_result_update, mock_result_select]

            from src.models.match import MatchAction

            updated_match = matching_service_module.update_match(match_id, user1.id, MatchAction.LIKE)

            assert updated_match.id == match_id
            # Verify cache invalidation
            mock_delete_cache.assert_called()
            # Verify cache set (get_match caches the result)
            mock_cache_module["set"].assert_called()

    def test_get_user_matches(self, matching_service_module, mock_db_module, sample_users):
        user1, _ = sample_users

        with patch.object(matching_service_module, "get_user", return_value=user1):
            mock_result = MagicMock()
            mock_result.data = [
                {
                    "id": "match_1",
                    "user1_id": user1.id,
                    "user2_id": "other",
                    "status": "matched",
                    "score": {"total": 0.9, "location": 1.0, "interests": 0.8, "preferences": 0.9},
                    "created_at": datetime.now(),
                    "updated_at": datetime.now(),
                }
            ]
            mock_db_module.return_value = mock_result

            matches = matching_service_module.get_user_matches(user1.id)

            assert len(matches) == 1
            assert matches[0].id == "match_1"
            mock_db_module.assert_called_once()
