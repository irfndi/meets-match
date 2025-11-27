"""Mock models for testing."""

from enum import Enum
from typing import List

from .base import Model


# Mock enums
class Gender(str, Enum):
    """Mock gender enum."""

    MALE = "male"
    FEMALE = "female"


class RelationshipType(str, Enum):
    """Mock relationship type enum."""

    FRIENDSHIP = "friendship"
    DATING = "dating"
    BUSINESS = "business"
    MENTORSHIP = "mentorship"


# Mock model classes
class User(Model):
    """Mock user model."""

    def __init__(
        self,
        id: str = "user123",
        telegram_id: int = 123456,
        username: str = "test_user",
        first_name: str = "Test",
        last_name: str = "User",
    ):
        super().__init__(
            id=id,
            telegram_id=telegram_id,
            username=username,
            first_name=first_name,
            last_name=last_name,
            created_at="2023-01-01T00:00:00Z",
            updated_at="2023-01-01T00:00:00Z",
            last_active="2023-01-01T00:00:00Z",
            is_active=True,
            is_admin=False,
            is_banned=False,
        )


class Location(Model):
    """Mock location model."""

    def __init__(
        self,
        id: str = "loc123",
        user_id: str = "user123",
        city: str = "Test City",
        country: str = "Test Country",
    ):
        super().__init__(
            id=id,
            user_id=user_id,
            city=city,
            country=country,
            latitude=0.0,
            longitude=0.0,
            created_at="2023-01-01T00:00:00Z",
            updated_at="2023-01-01T00:00:00Z",
        )


class Preferences(Model):
    """Mock preferences model."""

    def __init__(
        self,
        id: str = "pref123",
        user_id: str = "user123",
        gender_preference: List[str] | None = None,
        age_min: int = 10,
        age_max: int = 65,
        relationship_types: List[str] | None = None,
    ):
        super().__init__(
            id=id,
            user_id=user_id,
            gender_preference=gender_preference or [Gender.MALE.value, Gender.FEMALE.value],
            age_min=age_min,
            age_max=age_max,
            relationship_types=relationship_types or [RelationshipType.FRIENDSHIP.value],
            created_at="2023-01-01T00:00:00Z",
            updated_at="2023-01-01T00:00:00Z",
        )


class Match(Model):
    """Mock match model."""

    def __init__(self, user1_id, user2_id):
        super().__init__(user1_id=user1_id, user2_id=user2_id)
