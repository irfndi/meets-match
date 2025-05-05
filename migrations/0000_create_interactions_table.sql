-- Migration number: 0000 	 2025-05-04T13:30:00.000Z
-- Description: Create the initial interactions table

CREATE TABLE interactions (
    id TEXT PRIMARY KEY,
    actor_user_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('LIKE', 'DISLIKE')), -- Enforce valid types
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'MATCHED', 'BLOCKED')), -- Enforce valid statuses
    created_at TEXT NOT NULL -- Store as ISO8601 string
);

-- Optional: Add indexes for common queries
CREATE INDEX idx_interactions_actor_target ON interactions (actor_user_id, target_user_id);
CREATE INDEX idx_interactions_type ON interactions (type);
CREATE INDEX idx_interactions_status ON interactions (status);
