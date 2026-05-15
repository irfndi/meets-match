--- Daily media upload tracking for free tier (10 uploads/day)

ALTER TABLE users ADD COLUMN daily_media_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_media_reset_at TEXT;

-- Migrate existing users: start fresh
UPDATE users SET daily_media_used = 0, daily_media_reset_at = NULL;
