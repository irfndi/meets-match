-- Note: PostgreSQL doesn't support removing values from enums easily
-- The enum values will remain but won't be used

-- Drop indexes
DROP INDEX IF EXISTS idx_users_reengagement_candidates;
DROP INDEX IF EXISTS idx_users_last_reminded_at;
DROP INDEX IF EXISTS idx_users_last_active;
