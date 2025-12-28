-- Add re-engagement notification types to existing enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_gentle';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_urgent';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_last_chance';

-- Add indexes on users table for efficient inactive user queries
-- These support the re-engagement job that queries for inactive users
CREATE INDEX IF NOT EXISTS idx_users_last_active
    ON users(last_active);

CREATE INDEX IF NOT EXISTS idx_users_last_reminded_at
    ON users(last_reminded_at);

-- Composite index for finding re-engagement candidates efficiently
-- Users who are active, not sleeping, and haven't been reminded recently
CREATE INDEX IF NOT EXISTS idx_users_reengagement_candidates
    ON users(last_active, last_reminded_at)
    WHERE is_active = TRUE AND is_sleeping = FALSE;

-- Comments for documentation
COMMENT ON INDEX idx_users_last_active IS 'Support for inactive user queries in re-engagement job';
COMMENT ON INDEX idx_users_reengagement_candidates IS 'Composite index for efficient re-engagement candidate lookup';
