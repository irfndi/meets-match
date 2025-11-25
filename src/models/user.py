"""User model for the MeetMatch bot."""

# TODO: Cloudflare D1 Migration
# These Pydantic models define the data structure and validation.
# They are generally compatible with Cloudflare D1 which uses JSON objects.
# However, the persistence logic (CRUD operations) that uses these models
# (likely located in the 'src/services/' directory) needs to be rewritten
# to use the Cloudflare D1 client API instead of Supabase/SQLAlchemy.

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, validator

from src.utils.errors import ValidationError


class Gender(str, Enum):
    """Gender enumeration."""

    MALE = "male"
    FEMALE = "female"


class RelationshipType(str, Enum):
    """Relationship type enumeration."""

    FRIENDSHIP = "friendship"
    DATING = "dating"
    RELATIONSHIP = "relationship"
    MARRIAGE = "marriage"
    CASUAL = "casual"
    NETWORKING = "networking"


class Location(BaseModel):
    """User location model."""

    latitude: float
    longitude: float
    city: Optional[str] = None
    country: Optional[str] = None
    last_updated: datetime = Field(default_factory=datetime.now)


class Preferences(BaseModel):
    """User preferences model."""

    min_age: Optional[int] = None
    max_age: Optional[int] = None
    gender_preference: Optional[List[Gender]] = None
    relationship_type: Optional[List[RelationshipType]] = None
    max_distance: Optional[int] = None  # in kilometers
    notifications_enabled: Optional[bool] = True

    @validator("min_age", "max_age")
    def validate_age_range(cls, v: Optional[int], values: Dict[str, int]) -> Optional[int]:
        """Validate age range.

        Args:
            v: Age value
            values: Previously validated values

        Returns:
            Validated age value

        Raises:
            ValidationError: If age is invalid
        """
        if v is not None and (v < 10 or v > 65):
            raise ValidationError("Age must be between 10 and 65")

        # Check min_age <= max_age if both are set
        if "min_age" in values and values["min_age"] is not None and v is not None:
            if values["min_age"] > v:
                raise ValidationError("min_age must be less than or equal to max_age")

        return v

    @validator("max_distance")
    def validate_distance(cls, v: Optional[int]) -> Optional[int]:
        """Validate distance range.

        Args:
            v: Distance value

        Returns:
            Validated distance value

        Raises:
            ValidationError: If distance is invalid
        """
        if v is not None and (v < 1 or v > 500):
            raise ValidationError("Distance must be between 1 and 500 kilometers")
        return v


class User(BaseModel):
    """User model."""

    id: str = Field(..., description="Unique user ID (Telegram user ID)")
    username: Optional[str] = None
    first_name: str
    last_name: Optional[str] = None
    bio: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[Gender] = None
    interests: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)
    location: Optional[Location] = None
    preferences: Preferences = Field(default_factory=Preferences)
    is_active: bool = True
    is_profile_complete: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    last_active: datetime = Field(default_factory=datetime.now)

    @validator("age")
    def validate_age(cls, v: Optional[int]) -> Optional[int]:
        """Validate user age.

        Args:
            v: Age value

        Returns:
            Validated age value

        Raises:
            ValidationError: If age is invalid
        """
        if v is not None and (v < 10 or v > 65):
            raise ValidationError("Age must be between 10 and 65")
        return v

    @validator("interests")
    def validate_interests(cls, v: List[str]) -> List[str]:
        """Validate user interests.

        Args:
            v: List of interests

        Returns:
            Validated interests list

        Raises:
            ValidationError: If interests are invalid
        """
        # Normalize interests (lowercase, trim whitespace)
        normalized = [interest.lower().strip() for interest in v]

        # Remove duplicates while preserving order
        unique_interests = []
        for interest in normalized:
            if interest and interest not in unique_interests:
                unique_interests.append(interest)

        return unique_interests

    @validator("photos")
    def validate_photos(cls, v: List[str]) -> List[str]:
        """Validate user photos.

        Args:
            v: List of photo URLs or file IDs

        Returns:
            Validated photos list

        Raises:
            ValidationError: If photos are invalid
        """
        if len(v) > 6:
            raise ValidationError("Maximum 6 photos allowed")
        return v

    def is_match_eligible(self) -> bool:
        """Check if user is eligible for matching.

        Returns:
            True if user is eligible for matching, False otherwise
        """
        return (
            self.is_active
            and self.is_profile_complete
            and self.age is not None
            and self.gender is not None
            and self.location is not None
            and len(self.interests) > 0
            and len(self.photos) > 0
        )
