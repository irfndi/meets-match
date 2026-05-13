-- D1 (SQLite) schema: Re-engagement indexes
-- Ported from PostgreSQL 000004_add_reengagement_notifications.up.sql

CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);
CREATE INDEX IF NOT EXISTS idx_users_last_reminded_at ON users(last_reminded_at);
CREATE INDEX IF NOT EXISTS idx_users_reengagement_candidates ON users(last_active, last_reminded_at)
    WHERE is_active = 1 AND is_sleeping = 0;
