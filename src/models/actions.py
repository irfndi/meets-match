"""Models for user actions like Liking and Disliking profiles."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Using UUIDs as strings for primary keys compatible with D1


class ActionType(str, Enum):
    LIKE = "like"
    DISLIKE = "dislike"


class Like(BaseModel):
    """Represents a 'Like' action from one user to another."""

    liker_id: str = Field(..., description="ID of the user performing the like action.")
    liked_id: str = Field(..., description="ID of the user being liked.")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when the like occurred.")

    @model_validator(mode="before")
    @classmethod
    def check_self_like(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        liker_id = values.get("liker_id")
        liked_id = values.get("liked_id")
        if liker_id and liked_id and liker_id == liked_id:
            raise ValueError("Liker and liked user cannot be the same.")
        return values

    @field_validator("liker_id", "liked_id")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("User IDs cannot be empty")
        return v

    model_config = ConfigDict(frozen=True, extra="forbid")


class Dislike(BaseModel):
    """Represents a 'Dislike' action from one user to another."""

    disliker_id: str = Field(..., description="The ID of the user performing the dislike action.")
    disliked_id: str = Field(..., description="The ID of the user being disliked.")
    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="Timestamp when the dislike was recorded."
    )
    disliked_at: datetime = Field(
        default_factory=datetime.utcnow, description="Timestamp used for dislike expiry logic."
    )

    @model_validator(mode="before")
    @classmethod
    def check_self_dislike(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        disliker_id = values.get("disliker_id")
        disliked_id = values.get("disliked_id")
        if disliker_id and disliked_id and disliker_id == disliked_id:
            raise ValueError("Disliker and disliked user cannot be the same.")
        return values

    @field_validator("disliker_id", "disliked_id")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("User IDs cannot be empty")
        return v

    model_config = ConfigDict(frozen=True, extra="forbid")
