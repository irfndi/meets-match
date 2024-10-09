import pytest
from bot.database.user_management import create_user

@pytest.mark.asyncio
async def test_create_user():
    user_data = {
        "username": "Test User",
        "age": 25,
        "gender": "female",
        "interests": ["music", "art"]
    }
    result = await create_user(**user_data)
    assert result is not None  # Add appropriate assertions based on your implementation
