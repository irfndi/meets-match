"""User model for the MeetMatch bot."""

# TODO: Cloudflare D1 Migration
# These Pydantic models define the data structure and validation.
# They are generally compatible with Cloudflare D1 which uses JSON objects.
# However, the persistence logic (CRUD operations) that uses these models
# (likely located in the 'src/services/' directory) needs to be rewritten
# to use the Cloudflare D1 client API instead of Supabase/SQLAlchemy.

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator


class Gender(Enum):
    """Gender enumeration."""

    MALE = "male"
    FEMALE = "female"
    NON_BINARY = "non-binary"
    OTHER = "other"
    PREFER_NOT_SAY = "prefer_not_say"


class RelationshipType(Enum):
    """Relationship type enumeration."""

    LONG_TERM = "long_term"
    SHORT_TERM = "short_term"
    FRIENDSHIP = "friendship"
    CASUAL = "casual"


class Location(BaseModel):
    """User location model."""

    latitude: float
    longitude: float
    city: str | None = None
    country: str | None = None
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Preferences(BaseModel):
    """User preferences model."""

    min_age: int = 18
    max_age: int = 100
    gender_preference: Literal["male", "female", "any"] = "any"
    relationship_type: Optional[List[RelationshipType]] = None
    max_distance: int = 50  # Default max distance in km

    @model_validator(mode="after")
    def check_age_range(self) -> "Preferences":
        if self.min_age is not None and self.max_age is not None:
            if self.min_age > self.max_age:
                raise ValueError("Minimum age cannot be greater than maximum age.")
        return self

    @field_validator("min_age", "max_age")
    @classmethod
    def check_age_bounds(cls, v: int) -> int:
        if v < 18:
            raise ValueError("Age must be 18 or older.")
        if v > 100:
            raise ValueError("Age must be 100 or younger.")
        return v

    @field_validator("max_distance")
    @classmethod
    def check_max_distance(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Maximum distance must be positive.")
        return v

    model_config = ConfigDict(extra="ignore")


class User(BaseModel):
    """User model."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    telegram_id: int
    username: str | None = None
    full_name: str
    bio: str | None = None
    birth_date: date
    gender: Literal["male", "female", "non-binary", "other", "prefer_not_say"]
    preferences: Preferences | None = None
    interests: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)  # List of photo URLs or IDs
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    is_banned: bool = False
    latitude: float | None = None
    longitude: float | None = None

    @computed_field
    @property
    def age(self) -> int:
        today = date.today()
        return (
            today.year
            - self.birth_date.year
            - ((today.month, today.day) < (self.birth_date.month, self.birth_date.day))
        )

    @field_validator("birth_date")
    @classmethod
    def check_minimum_age(cls, v: date) -> date:
        today = date.today()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 18:
            raise ValueError("User must be at least 18 years old.")
        return v

    @field_validator("interests", mode="before")
    @classmethod
    def check_interests_limit(cls, v: Any) -> Any:
        if isinstance(v, list) and len(v) > 10:
            raise ValueError("User can have a maximum of 10 interests.")
        # TODO: Validate interest strings against a predefined list?
        return v

    @field_validator("photos", mode="before")
    @classmethod
    def check_photos_limit(cls, v: Any) -> Any:
        if isinstance(v, list) and len(v) > 5:
            raise ValueError("User can have a maximum of 5 photos.")
        # TODO: Validate photo URLs/IDs format?
        return v

    model_config = ConfigDict(extra="ignore", from_attributes=True)
