import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Updated User class
@dataclass
class User:
    username: str
    id: Optional[UUID] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    looking_for: Optional[str] = None
    city: Optional[str] = None
    name: Optional[str] = None
    bio: Optional[str] = None
    media: List[dict] = field(default_factory=list)
    language: str = 'english'
    last_profile_check: Optional[datetime] = None
    profile_completed: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    interests: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    videos: Optional[List[str]] = None

    def is_complete(self) -> bool:
        required_fields = ['age', 'gender', 'looking_for', 'city', 'name', 'bio']
        return all(getattr(self, field) is not None for field in required_fields) and len(self.media) > 0

# Updated Preference class
@dataclass
class Preference:
    user_id: UUID
    age_min: int
    age_max: int
    gender_preference: str
    interests: List[str] = field(default_factory=list)
    max_distance: int = 0
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

# Updated Match class
@dataclass
class Match:
    user1_id: UUID
    user2_id: UUID
    status: str = "pending"
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

# Updated Report class
@dataclass
class Report:
    reporter_id: UUID
    reported_id: UUID
    reason: str
    status: str = "pending"
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

def get_supabase_type(python_type: type) -> str:
    type_mapping = {
        UUID: 'uuid',
        datetime: 'timestamp with time zone',
        int: 'integer',
        str: 'text',
        bool: 'boolean',
        List[str]: 'text[]'
    }
    return type_mapping.get(python_type, 'text')

# Additional classes or functions may be needed to achieve goals outlined in introduction.md
# For example, implementing user verification, privacy controls, and reporting/blocking functionality
# could enhance the overall user experience and security of the application.
