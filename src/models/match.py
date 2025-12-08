"""Match model for the MeetMatch bot."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MatchStatus(str, Enum):
    """
    Match status enumeration.

    Represents the current state of a match between two users.
    """

    PENDING = "pending"  # One user liked, waiting for the other
    MATCHED = "matched"  # Both users liked each other
    REJECTED = "rejected"  # One user rejected the other
    EXPIRED = "expired"  # Match expired without action


class MatchAction(str, Enum):
    """
    Match action enumeration.

    Represents an action taken by a user on a match proposal.
    """

    LIKE = "like"
    DISLIKE = "dislike"
    SKIP = "skip"


class MatchScore(BaseModel):
    """
    Match score model.

    Stores the compatibility scores between two users based on various factors.
    """

    total: float
    location: float
    interests: float
    preferences: float


class Match(BaseModel):
    """
    Match model.

    Represents a potential or active match between two users, including their
    actions, the match status, and compatibility score.
    """

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
        """
        Update match status based on user actions.

        This method evaluates the actions taken by both users and updates
        the `status` and `matched_at` fields accordingly.
        - If both users LIKE, status becomes MATCHED.
        - If either user DISLIKES, status becomes REJECTED.
        - Otherwise, status remains PENDING.
        """
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
    """
    User match view model.

    A simplified model used for presenting match information to users,
    containing details about the matched partner and the match metadata.
    """

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
