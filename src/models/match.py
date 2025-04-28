"""Match model for the MeetMatch bot."""

# TODO: Cloudflare D1 Migration
# These Pydantic models define the data structure and validation.
# They are generally compatible with Cloudflare D1 which uses JSON objects.
# However, the persistence logic (CRUD operations) that uses these models
# (likely located in the 'src/services/' directory) needs to be rewritten
# to use the Cloudflare D1 client API instead of Supabase/SQLAlchemy.

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MatchStatus(str, Enum):
    """Match status enumeration."""

    PENDING = "pending"  # One user liked, waiting for the other
    MATCHED = "matched"  # Both users liked each other
    REJECTED = "rejected"  # One user rejected the other
    EXPIRED = "expired"  # Match expired without action


class MatchAction(str, Enum):
    """Match action enumeration."""

    LIKE = "like"
    DISLIKE = "dislike"
    SKIP = "skip"


class MatchScore(BaseModel):
    """Match score model."""

    total: float
    location: float
    interests: float
    preferences: float


class Match(BaseModel):
    """Match model."""

    id: str
    user1_id: str
    user2_id: str
    user1_action: Optional[MatchAction] = None
    user2_action: Optional[MatchAction] = None
    status: MatchStatus = MatchStatus.PENDING
    score: MatchScore
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    matched_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None

    def update_status(self) -> None:
        """Update match status based on user actions."""
        now = datetime.now()
        self.updated_at = now

        # Both users liked each other
        if self.user1_action == MatchAction.LIKE and self.user2_action == MatchAction.LIKE:
            self.status = MatchStatus.MATCHED
            self.matched_at = now

        # One user rejected the other
        elif self.user1_action == MatchAction.DISLIKE or self.user2_action == MatchAction.DISLIKE:
            self.status = MatchStatus.REJECTED

        # Otherwise, keep as pending
        else:
            self.status = MatchStatus.PENDING


class UserMatch(BaseModel):
    """User match view model (for presenting matches to users)."""

    match_id: str
    user_id: str  # The other user's ID
    username: Optional[str] = None
    first_name: str
    age: Optional[int] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    common_interests: list[str] = Field(default_factory=list)
    match_score: float
    status: MatchStatus
    created_at: datetime
    matched_at: Optional[datetime] = None
