import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Allowed report reasons - keep in sync with report_service.py
# TODO: Consider moving this list to a shared config or enum
ALLOWED_REPORT_REASONS = [
    "inappropriate_content",
    "harassment",
    "spam",
    "fake_profile",
    "underage",
    "other",
]


class Report(BaseModel):
    """Represents a user report record."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    reporter_id: str
    reported_id: str
    reason: str
    created_at: datetime = Field(default_factory=datetime.now)

    @field_validator("reason")
    @classmethod
    def reason_must_be_allowed(cls, v):
        if v not in ALLOWED_REPORT_REASONS:
            raise ValueError(f"Invalid report reason. Must be one of: {ALLOWED_REPORT_REASONS}")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "reporter_id": "user_abc_123",
                "reported_id": "user_def_456",
                "reason": "spam",
                "created_at": "2023-10-27T10:00:00Z",
            }
        }
    )
