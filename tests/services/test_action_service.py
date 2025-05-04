from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.action_service import dislike_match, like_match


# Patch the dependency directly within the test
@patch("src.services.action_service.record_match_action", new_callable=AsyncMock)
@pytest.mark.asyncio
@pytest.mark.filterwarnings("ignore::RuntimeWarning")  # Suppress persistent warning
async def test_like_match_results_in_mutual_match(mock_record_match_action: AsyncMock, mock_env: MagicMock) -> None:
    """Test recording a like action that results in a mutual match."""
    user_id = "user1"
    target_user_id = "user2"

    # Set the return value for the patched function (True = mutual match)
    mock_record_match_action.return_value = True

    # Call the service function directly
    result = await like_match(mock_env, user_id, target_user_id)

    # Assertions
    # Assert that the underlying matching_service function was called correctly
    mock_record_match_action.assert_awaited_once_with(mock_env, user_id, target_user_id, "like")
    # Assert the function returned the correct value
    assert result is True


# Patch the dependency directly within the test
@patch("src.services.action_service.record_match_action", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_like_match_no_mutual_match(mock_record_match_action: AsyncMock, mock_env: MagicMock) -> None:
    """Test recording a like action that does not result in a mutual match."""
    user_id = "user1"
    target_user_id = "user2"

    # Set the return value for the patched function (False = no mutual match)
    mock_record_match_action.return_value = False

    # Call the service function directly
    result = await like_match(mock_env, user_id, target_user_id)

    # Assertions
    mock_record_match_action.assert_awaited_once_with(mock_env, user_id, target_user_id, "like")
    assert result is False


# Patch the dependency directly within the test
@patch("src.services.action_service.record_match_action", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_record_dislike(mock_record_match_action: AsyncMock, mock_env: MagicMock) -> None:
    """Test successfully recording a dislike action."""
    user_id = "user1"
    target_user_id = "user2"

    # Set the return value for the patched function (dislike doesn't return match status)
    mock_record_match_action.return_value = None

    # Call the service function directly
    await dislike_match(mock_env, user_id, target_user_id)

    # Assertions
    # Assert that the underlying matching_service function was called correctly
    mock_record_match_action.assert_awaited_once_with(mock_env, user_id, target_user_id, "dislike")


# Add tests for error handling (e.g., duplicate actions), no match scenarios, etc.
