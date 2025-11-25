"""Mock models for testing."""

import uuid
from datetime import datetime
from enum import Enum
from typing import ClassVar, List

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


class ConversationStatus(str, Enum):
    """Mock conversation status enum."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    BLOCKED = "blocked"


class MessageType(str, Enum):
    """Mock message type enum."""

    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    DOCUMENT = "document"


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


class Conversation(Model):
    """Mock conversation model."""

    instances: ClassVar[List["Conversation"]] = []

    def __init__(self):
        super().__init__(id=str(uuid.uuid4()), messages=[])
        Conversation.instances.append(self)


class Message(Model):
    """Mock message model."""

    def __init__(self, content: str = "Test message", sender_id: str = "user123"):
        super().__init__(content=content, sender_id=sender_id, created_at=datetime.now())

    @classmethod
    async def create(cls, conversation_id, content, sender_id):
        new_message = cls(content, sender_id)
        for conv in Conversation.instances:
            if conv.id == conversation_id:
                conv.messages.append(new_message)
                new_message.conversation_id = conversation_id
                break
        return new_message


class Match(Model):
    """Mock match model."""

    def __init__(self, user1_id, user2_id):
        super().__init__(user1_id=user1_id, user2_id=user2_id)
