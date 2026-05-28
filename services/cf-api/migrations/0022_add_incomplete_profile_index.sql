-- Index for incomplete profile re-engagement queries
-- Supports the query: is_profile_complete = 0, is_active = 1, is_sleeping = 0
-- with filtering on created_at and last_reminded_at
CREATE INDEX IF NOT EXISTS idx_users_incomplete_reengagement
ON users(created_at, last_reminded_at)
WHERE is_active = 1 AND is_sleeping = 0 AND is_profile_complete = 0;
