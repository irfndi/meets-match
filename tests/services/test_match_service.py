import pytest

from tests.mocks.models import Match
from tests.mocks.utils import ValidationError


@pytest.mark.asyncio
async def test_create_match_success(mock_application):
    from tests.mocks.services import create_match

    create_match.return_value = Match(user1_id="user123", user2_id="user456")

    from src.services.match_service import create_match as real_create_match

    match = await real_create_match("user123", "user456")

    assert match.user1_id == "user123"
    create_match.assert_awaited_once_with("user123", "user456")


@pytest.mark.asyncio
async def test_create_match_invalid_users(mock_application):
    from tests.mocks.services import create_match

    create_match.side_effect = ValidationError("Invalid user IDs")

    from src.services.match_service import create_match as real_create_match

    with pytest.raises(ValidationError):
        await real_create_match("invalid", "user456")
