-- D1 (SQLite) schema: Reengagement stages + daily-message tracking
-- Adds per-user state for 3-stage reengagement escalation (GENTLE/URGENT/LAST_CHANCE)
-- and a per-day "already messaged today" throttle for active-user daily nudges.

ALTER TABLE users ADD COLUMN last_reengagement_stage INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_reengagement_at TEXT;
ALTER TABLE users ADD COLUMN last_daily_message_at TEXT;
ALTER TABLE users ADD COLUMN last_daily_message_type TEXT;

CREATE INDEX IF NOT EXISTS idx_users_last_reengagement_at
  ON users(last_reengagement_at)
  WHERE last_reengagement_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_daily_message_at
  ON users(last_daily_message_at)
  WHERE last_daily_message_at IS NOT NULL;

-- Supports the 3-stage reengagement candidate query:
-- is_active = 1 AND is_sleeping = 0 AND is_profile_complete = 1
-- AND last_active <= ?
-- AND (last_reengagement_at IS NULL OR last_reengagement_at <= ?)
CREATE INDEX IF NOT EXISTS idx_users_reengagement_stage_candidates
  ON users(last_active, last_reengagement_at)
  WHERE is_active = 1 AND is_sleeping = 0 AND is_profile_complete = 1;

-- Supports the daily-active candidate query:
-- is_active = 1 AND is_sleeping = 0 AND is_profile_complete = 1
-- AND last_active >= ?
-- AND (last_daily_message_at IS NULL OR last_daily_message_at <= ?)
CREATE INDEX IF NOT EXISTS idx_users_daily_active_candidates
  ON users(last_active, last_daily_message_at)
  WHERE is_active = 1 AND is_sleeping = 0 AND is_profile_complete = 1;
