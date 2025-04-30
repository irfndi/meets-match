import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from src.models.user import Preferences
from src.services.matching_service import (
    SQL_CHECK_LIKE,
    SQL_INSERT_DISLIKE,
    SQL_INSERT_LIKE,
    SQL_INSERT_MATCH,
    SQL_SELECT_POTENTIAL_MATCH_IDS,
    get_potential_matches,
    record_match_action,
)
from src.utils.geo import haversine_distance
from tests.conftest import (
    USER_1,
    USER_2,
    USER_3,
    USER_4,
    USER_5,
)


class TestMatchingService:
    # --- Tests for record_match_action ---
    @patch("src.services.matching_service.datetime")
    async def test_record_like_success(self, mock_datetime, mock_settings):
        """Test recording a 'like' successfully inserts into D1 and clears cache."""
        actor_id = USER_1.id
        target_id = USER_2.id
        action = "like"

        # Define timestamp and configure mock
        test_timestamp = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        expected_iso_timestamp = test_timestamp.isoformat()
        # Mock both the .now() call and the .isoformat() on its return value
        mock_now_instance = MagicMock()
        mock_now_instance.isoformat.return_value = expected_iso_timestamp
        mock_datetime.now.return_value = mock_now_instance

        # Mocks for the chained calls: prepare -> bind -> run/first
        mock_like_binding = MagicMock()
        mock_like_binding.run = AsyncMock()
        mock_like_stmt = MagicMock()
        mock_like_stmt.bind.return_value = mock_like_binding

        mock_check_binding = MagicMock()
        mock_check_binding.first = AsyncMock(return_value=None)
        mock_check_stmt = MagicMock()
        mock_check_stmt.bind.return_value = mock_check_binding

        # Mock DB.prepare using a side effect to return specific statement mocks
        def prepare_side_effect_like(sql_query):
            if sql_query == SQL_INSERT_LIKE:
                return mock_like_stmt
            elif sql_query == SQL_CHECK_LIKE:
                return mock_check_stmt
            else:
                return MagicMock()  # Default mock for other queries

        # Patch using the pre-configured MagicMock
        with (
            patch.object(mock_settings.DB, "prepare") as mock_prepare_patch,
            patch.object(mock_settings.KV, "delete", new_callable=AsyncMock) as _,
        ):
            # Set the side_effect of the synchronous prepare mock
            mock_prepare_patch.side_effect = prepare_side_effect_like

            # --- Execute --- #
            result = await record_match_action(mock_settings, actor_id, target_id, action)

            # --- Assert --- #
            assert not result

            # Assert prepare was called with the correct SQL
            expected_prepare_calls = [
                call(SQL_INSERT_LIKE),
                call(SQL_CHECK_LIKE),
            ]
            mock_prepare_patch.assert_has_calls(expected_prepare_calls, any_order=False)
            assert mock_prepare_patch.call_count == 2  # Ensure exactly two calls

            # Assert specific statement methods were called
            mock_like_stmt.bind.assert_called_once_with(actor_id, target_id, expected_iso_timestamp)
            mock_like_binding.run.assert_called_once()  # Check run called on binding
            mock_check_stmt.bind.assert_called_once_with(target_id, actor_id)
            mock_check_binding.first.assert_called_once()  # Check first called on binding

            # Assert KV cache was cleared for the actor
            mock_settings.KV.delete.assert_any_call(f"potential_matches:{actor_id}")  # Check delete was called

    @patch("src.services.matching_service.datetime")
    async def test_record_dislike_success(self, mock_datetime, mock_settings):
        """Test successfully recording a dislike."""
        actor_id = USER_1.id
        target_id = USER_2.id
        action = "dislike"

        # Define timestamp and configure mock
        test_timestamp = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        expected_iso_timestamp = test_timestamp.isoformat()
        # Mock both the .now() call and the .isoformat() on its return value
        mock_now_instance = MagicMock()
        mock_now_instance.isoformat.return_value = expected_iso_timestamp
        mock_datetime.now.return_value = mock_now_instance

        # Mocks for the chained calls: prepare -> bind -> run
        mock_dislike_binding = MagicMock()
        mock_dislike_binding.run = AsyncMock()
        mock_dislike_stmt = MagicMock()
        mock_dislike_stmt.bind.return_value = mock_dislike_binding

        # Patch using the pre-configured MagicMock
        with (
            patch.object(mock_settings.DB, "prepare") as mock_prepare_patch,
            patch.object(mock_settings.KV, "delete", new_callable=AsyncMock) as _,
        ):
            # Setup the mock DB prepare call
            # Patch the prepare method to return the mock statement
            mock_prepare_patch.side_effect = [mock_dislike_stmt]  # Use side_effect

            # --- Execute --- #
            result = await record_match_action(mock_settings, actor_id, target_id, action)

            # --- Assert --- #
            assert not result

            # Assert prepare was called with the correct SQL
            mock_prepare_patch.assert_called_once_with(SQL_INSERT_DISLIKE)

            # Assert bind was called on the statement mock
            mock_dislike_stmt.bind.assert_called_once_with(actor_id, target_id, expected_iso_timestamp)
            # Assert run was called on the binding mock
            mock_dislike_binding.run.assert_called_once()  # Check run called on binding

            # Assert KV cache was cleared
            expected_kv_calls = [call(f"potential_matches:{actor_id}"), call(f"potential_matches:{target_id}")]
            mock_settings.KV.delete.assert_has_calls(expected_kv_calls, any_order=True)
            assert mock_settings.KV.delete.call_count == 2

    @patch("src.services.matching_service.datetime")
    async def test_record_like_mutual_match(self, mock_datetime, mock_settings):
        """Test recording a 'like' that results in a mutual match."""
        actor_id = USER_1.id
        target_id = USER_2.id
        action = "like"

        test_timestamp = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        expected_iso_timestamp = test_timestamp.isoformat()
        # Mock both the .now() call and the .isoformat() on its return value
        mock_now_instance = MagicMock()
        mock_now_instance.isoformat.return_value = expected_iso_timestamp
        mock_datetime.now.return_value = mock_now_instance

        # Mocks for the chained calls: prepare -> bind -> run/first
        mock_like_binding = MagicMock()
        mock_like_binding.run = AsyncMock()
        mock_like_stmt = MagicMock()
        mock_like_stmt.bind.return_value = mock_like_binding

        # Mock for the check statement (target likes actor?)
        mock_check_binding = MagicMock()
        mock_check_binding.first = AsyncMock(return_value={"result": 1})  # Simulate target liked actor
        mock_check_stmt = MagicMock()
        mock_check_stmt.bind.return_value = mock_check_binding

        # Mock for the match insert statement
        mock_insert_match_binding = MagicMock()
        mock_insert_match_binding.run = AsyncMock()
        mock_insert_match_stmt = MagicMock()
        mock_insert_match_stmt.bind.return_value = mock_insert_match_binding

        # Define side effect for prepare
        def prepare_side_effect_mutual(sql_query):
            if prepare_side_effect_mutual.call_count == 0:
                prepare_side_effect_mutual.call_count += 1
                return mock_like_stmt  # Directly return the statement mock
            elif prepare_side_effect_mutual.call_count == 1:
                prepare_side_effect_mutual.call_count += 1
                return mock_check_stmt  # Directly return the statement mock
            else:
                prepare_side_effect_mutual.call_count += 1  # Ensure call count increments
                return mock_insert_match_stmt  # Directly return the statement mock

        prepare_side_effect_mutual.call_count = 0  # Initialize call counter

        # Patch using the pre-configured MagicMock
        with (
            patch.object(mock_settings.DB, "prepare") as mock_prepare_sync_patch,  # Mock the sync call
            patch.object(mock_settings.KV, "delete", new_callable=AsyncMock) as _,
        ):
            # Set the side_effect of the synchronous prepare mock
            mock_prepare_sync_patch.side_effect = prepare_side_effect_mutual

            # --- Execute --- #
            # The await here is on the result of prepare(...).bind(...).run/first()
            result = await record_match_action(mock_settings, actor_id, target_id, action)

            # --- Assert --- #
            # Assert the sync prepare mock was called 3 times
            assert mock_prepare_sync_patch.call_count == 3
            # Check the specific SQL queries passed to the sync prepare call
            # Use mock.call for proper comparison of *awaited* arguments
            mock_prepare_sync_patch.assert_has_calls(
                [
                    call(SQL_INSERT_LIKE),
                    call(SQL_CHECK_LIKE),
                    call(SQL_INSERT_MATCH),
                ],
                any_order=False,
            )  # Ensure order is correct

            # Assert bind/run/first calls on the *statement* mocks
            mock_like_stmt.bind.assert_called_once_with(actor_id, target_id, expected_iso_timestamp)
            mock_like_binding.run.assert_called_once()
            mock_check_stmt.bind.assert_called_once_with(target_id, actor_id)
            mock_check_binding.first.assert_called_once()  # Check first called on binding

            # Ensure consistent order for user1_id, user2_id in match insert
            user1, user2 = sorted([actor_id, target_id])
            mock_insert_match_stmt.bind.assert_called_once_with(user1, user2, expected_iso_timestamp)
            mock_insert_match_binding.run.assert_called_once()

            # Assert KV delete calls
            mock_settings.KV.delete.assert_any_call(f"potential_matches:{actor_id}")
            mock_settings.KV.delete.assert_any_call(f"potential_matches:{target_id}")
            assert mock_settings.KV.delete.call_count == 2  # Explicitly check count

            # Assert mutual match result
            assert result is True

    # --- Tests for get_potential_matches ---
    @patch("src.services.matching_service._get_users_disliking_target", new_callable=AsyncMock)
    @patch("src.services.matching_service._get_user_disliked_ids", new_callable=AsyncMock)
    @patch("src.services.matching_service._get_user_liked_ids", new_callable=AsyncMock)
    @patch("src.services.matching_service.get_user", new_callable=AsyncMock)
    async def test_get_potential_matches_cache_hit(
        self, mock_get_user, mock_get_liked_ids, mock_get_disliked_ids, mock_get_disliking_target, mock_settings
    ):
        """Test getting potential matches successfully from cache."""
        user_id = USER_1.id
        expected_users = [USER_2, USER_3]  # Users expected from cache
        cache_key = f"potential_matches:{user_id}"  # Define cache key
        # Simulate cache hit with a JSON list of *IDs* (as the function expects)
        expected_ids_in_cache = [USER_2.id, USER_3.id]
        cached_data_json = json.dumps(expected_ids_in_cache)
        mock_settings.KV.get = AsyncMock(return_value=cached_data_json)

        # Add mock for get_user as it's called at the start of get_potential_matches
        # Mock get_user side effect to return the current user and the expected matches
        async def mock_get_user_side_effect(env, uid):
            user_map = {
                user_id: USER_1,
                USER_2.id: USER_2,
                USER_3.id: USER_3,  # Keep USER_3 as is, assumed complete from conftest
            }
            return user_map.get(uid)

        mock_get_user.side_effect = mock_get_user_side_effect

        # Patch prepare within this test context
        with patch.object(mock_settings.DB, "prepare") as mock_prepare_patch:  # Add prepare patch
            # --- Execute --- #
            result = await get_potential_matches(mock_settings, user_id, limit=10, offset=0)

            # --- Assert --- #
            mock_settings.KV.get.assert_awaited_once_with(cache_key)  # Assert cache read
            assert result == expected_users
            # DB methods should NOT be called
            mock_prepare_patch.assert_not_called()

    @patch("src.services.matching_service._get_users_disliking_target", new_callable=AsyncMock)
    @patch("src.services.matching_service._get_user_disliked_ids", new_callable=AsyncMock)
    @patch("src.services.matching_service._get_user_liked_ids", new_callable=AsyncMock)
    @patch("src.services.matching_service.get_user", new_callable=AsyncMock)
    async def test_get_potential_matches_cache_miss_db_fetch(
        self,
        mock_get_user,
        mock_get_liked_ids,
        mock_get_disliked_ids,
        mock_get_disliking_target,
        mock_settings,
    ):
        """Test getting potential matches from DB when cache misses."""
        user_id = USER_1.id
        # Filtering (based on mocks below): Remove user2 (dislikes user1), remove user3 (disliked by user1)
        # Remaining: user4
        expected_users = [USER_4.model_copy(update={"preferences": Preferences(), "latitude": 1.0, "longitude": 1.0})]
        mock_settings.KV.get.return_value = None

        # --- Configure DB.prepare side_effect specifically for this test --- #
        # 1. Define the specific statement mock needed for this test
        # Define what the mock DB's .all() should return
        db_users = [{"id": USER_2.id}, {"id": USER_3.id}, {"id": USER_4.id}]
        mock_all = AsyncMock()
        mock_all.return_value = [{"id": user["id"]} for user in db_users]
        mock_binding = AsyncMock()
        mock_binding.all = mock_all
        mock_statement = MagicMock()  # Use MagicMock for statement
        mock_statement.bind.return_value = mock_binding

        # Patch DB prepare using the sync side_effect pattern
        with patch.object(mock_settings.DB, "prepare") as mock_prepare_patch:
            mock_prepare_patch.side_effect = [mock_statement]  # Return the statement mock

            # Mock get_user to return full user objects needed for scoring/filtering
            # Ensure potential matches have complete profiles
            async def mock_get_user_side_effect(env, uid):
                user_map = {
                    # Ensure USER_1 has large enough distance pref for test users
                    user_id: USER_1.model_copy(update={"preferences": Preferences(max_distance=10000)}),
                    USER_3.id: USER_3,  # Not expected from DB, but good practice if needed
                    USER_4.id: USER_4.model_copy(
                        update={"preferences": Preferences(), "latitude": 1.0, "longitude": 1.0}
                    ),  # Use model_copy
                }
                return user_map.get(uid)

            mock_get_user.side_effect = mock_get_user_side_effect

            # --- Mock filtering function return values --- #
            mock_get_liked_ids.return_value = {USER_3.id}
            mock_get_disliked_ids.return_value = set()
            mock_get_disliking_target.return_value = {USER_2.id}
            # --------------------------------------------- #

            # --- Execute --- #
            result = await get_potential_matches(mock_settings, user_id, limit=10, offset=0)

            # --- Assert --- #
            assert result == expected_users
            mock_settings.KV.get.assert_awaited_once_with(f"potential_matches:{user_id}")
            # Check DB fetch was called
            mock_prepare_patch.assert_called_once()  # Check SQL and params later if needed
            mock_statement.bind.assert_called_once()
            mock_binding.all.assert_awaited_once()
            # Assert cache was set after DB fetch
            mock_settings.KV.put.assert_awaited_once()
            # Verify the content being set to cache
            args, kwargs = mock_settings.KV.put.await_args
            assert args[0] == f"potential_matches:{user_id}"
            assert json.loads(args[1]) == [user.id for user in expected_users]

    @patch("src.services.matching_service._get_users_disliking_target", new_callable=AsyncMock)
    @patch("src.services.matching_service._get_user_disliked_ids", new_callable=AsyncMock)
    @patch("src.services.matching_service._get_user_liked_ids", new_callable=AsyncMock)
    @patch("src.services.matching_service.get_user", new_callable=AsyncMock)
    async def test_get_potential_matches_pagination(
        self,
        mock_get_user,
        mock_get_liked_ids,
        mock_get_disliked_ids,
        mock_get_disliking_target,
        mock_settings,
    ):
        """Test pagination logic in getting potential matches."""
        user_id = USER_1.id

        # Assume cache miss for pagination tests
        mock_settings.KV.get.return_value = None

        # Mock filtering functions - assume no one is filtered for simplicity
        mock_get_liked_ids.return_value = set()
        mock_get_disliked_ids.return_value = set()
        mock_get_disliking_target.return_value = set()  # No one dislikes user1

        # --- Mock get_user side effects for each page ---
        async def mock_get_user_side_effect(env, uid):
            user_map = {
                # Ensure USER_1 is complete for scoring
                user_id: USER_1.model_copy(
                    update={"preferences": Preferences(max_distance=5000), "latitude": 39.0, "longitude": -75.0}
                ),
                # Use model_copy
                USER_4.id: USER_4.model_copy(
                    update={"preferences": Preferences(max_distance=100), "latitude": 40.0, "longitude": -74.0}
                ),
                USER_5.id: USER_5.model_copy(
                    update={"preferences": Preferences(max_distance=100), "latitude": 34.0, "longitude": -118.0}
                ),
            }
            return user_map.get(uid)

        mock_get_user.side_effect = mock_get_user_side_effect  # Apply the combined side effect

        # --- Execute & Assert Page 1 --- #
        expected_page1 = [
            USER_4.model_copy(
                update={"preferences": Preferences(max_distance=100), "latitude": 40.0, "longitude": -74.0}
            )
        ]
        mock_all_page_1 = AsyncMock()
        mock_all_page_1.return_value = [{"id": USER_4.id}, {"id": USER_5.id}]
        mock_binding_page_1 = AsyncMock()
        mock_binding_page_1.all = mock_all_page_1
        mock_statement_page_1 = MagicMock()
        mock_statement_page_1.bind.return_value = mock_binding_page_1

        with patch.object(mock_settings.DB, "prepare") as mock_prepare_patch_page:
            mock_prepare_patch_page.side_effect = [mock_statement_page_1]
            result_page1 = await get_potential_matches(mock_settings, user_id, limit=1, offset=0)

            assert result_page1 == expected_page1
            mock_prepare_patch_page.assert_called_once()  # Check SQL and params later if needed
            assert mock_prepare_patch_page.call_args[0][0] == SQL_SELECT_POTENTIAL_MATCH_IDS
            mock_binding_page_1.all.assert_awaited_once()  # Check DB interaction awaited

        # Reset KV mock to simulate cache miss again for the second fetch if needed
        mock_settings.KV.get.reset_mock()
        mock_settings.KV.get.return_value = None  # Ensure cache miss for 2nd call

        # --- Execute & Assert Page 2 --- #
        expected_page2 = [
            USER_5.model_copy(
                update={"preferences": Preferences(max_distance=100), "latitude": 34.0, "longitude": -118.0}
            )
        ]
        mock_all_page_2 = AsyncMock()
        mock_all_page_2.return_value = [{"id": USER_4.id}, {"id": USER_5.id}]
        mock_binding_page_2 = AsyncMock()
        mock_binding_page_2.all = mock_all_page_2
        mock_statement_page_2 = MagicMock()
        mock_statement_page_2.bind.return_value = mock_binding_page_2

        with patch.object(mock_settings.DB, "prepare") as mock_prepare_patch_page:
            mock_prepare_patch_page.side_effect = [mock_statement_page_2]
            result_page2 = await get_potential_matches(mock_settings, user_id, limit=1, offset=1)

            assert result_page2 == expected_page2
            mock_prepare_patch_page.assert_called_once()  # Check SQL and params later if needed
            mock_binding_page_2.all.assert_awaited_once()
            # Check calls for the second page retrieval
            mock_get_user.assert_has_calls([call(mock_settings, USER_5.id)], any_order=True)

        # --- Execute & Assert Page 3 --- #
        expected_page3 = []
        mock_all_page_3 = AsyncMock()
        mock_all_page_3.return_value = [{"id": USER_4.id}, {"id": USER_5.id}]
        mock_binding_page_3 = AsyncMock()
        mock_binding_page_3.all = mock_all_page_3
        mock_statement_page_3 = MagicMock()
        mock_statement_page_3.bind.return_value = mock_binding_page_3

        with patch.object(mock_settings.DB, "prepare") as mock_prepare_patch_page:
            mock_prepare_patch_page.side_effect = [mock_statement_page_3]
            result_page3 = await get_potential_matches(mock_settings, user_id, limit=1, offset=2)

            assert result_page3 == expected_page3
            # DB should still be called even if result is empty post-pagination
            mock_prepare_patch_page.assert_called_once()  # Check SQL and params later if needed
            mock_binding_page_3.all.assert_called_once()

    def test_calculate_distance_correct(self):
        """Test distance calculation with known coordinates."""
        lat1, lon1 = 40.7128, -74.0060  # New York City
        lat2, lon2 = 34.0522, -118.2437  # Los Angeles
        distance = haversine_distance(lat1, lon1, lat2, lon2)
        assert distance > 3935 and distance < 3937  # km


if __name__ == "__main__":
    pytest.main()
