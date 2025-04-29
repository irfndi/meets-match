"""Conversation and Message models for the MeetMatch bot."""

# TODO: Cloudflare D1 Migration
# These Pydantic models define the data structure and validation.
# They are generally compatible with Cloudflare D1 which uses JSON objects.
# However, the persistence logic (CRUD operations) that uses these models
# (likely located in the 'src/services/' directory) needs to be rewritten
# to use the Cloudflare D1 client API instead of Supabase/SQLAlchemy.

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """Message type enumeration."""

    TEXT = "text"
    PHOTO = "photo"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"
    LOCATION = "location"
    CONTACT = "contact"
    STICKER = "sticker"
    ANIMATION = "animation"
    VOICE = "voice"
    SYSTEM = "system"  # System messages (match notification, etc.)


class Message(BaseModel):
    """Message model."""

    id: str
    conversation_id: str
    sender_id: str
    message_type: MessageType
    content: str
    media_url: Optional[str] = None
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    read_at: Optional[datetime] = None

    def mark_as_read(self) -> None:
        """Mark the message as read."""
        if not self.is_read:
            self.is_read = True
            self.read_at = datetime.now()
            self.updated_at = datetime.now()


class ConversationStatus(str, Enum):
    """Conversation status enumeration."""

    ACTIVE = "active"
    ARCHIVED = "archived"
    BLOCKED = "blocked"


class Conversation(BaseModel):
    """Conversation model."""

    id: str
    match_id: str
    user1_id: str
    user2_id: str
    status: ConversationStatus = ConversationStatus.ACTIVE
    last_message_id: Optional[str] = None
    last_message_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    messages: List[Message] = Field(default_factory=list)

    def add_message(self, message: Message) -> None:
        """Add a message to the conversation.

        Args:
            message: Message to add
        """
        self.messages.append(message)
        self.last_message_id = message.id
        self.last_message_at = message.created_at
        self.updated_at = datetime.now()

    def get_unread_count(self, user_id: str) -> int:
        """Get the number of unread messages for a user.

        Args:
            user_id: User ID

        Returns:
            Number of unread messages
        """
        return sum(1 for message in self.messages if not message.is_read and message.sender_id != user_id)

    def mark_all_as_read(self, user_id: str) -> None:
        """Mark all messages as read for a user.

        Args:
            user_id: User ID
        """
        now = datetime.now()
        for message in self.messages:
            if not message.is_read and message.sender_id != user_id:
                message.is_read = True
                message.read_at = now
                message.updated_at = now
        self.updated_at = now
