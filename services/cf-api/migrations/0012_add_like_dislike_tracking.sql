-- Migration: Add separate like/dislike daily tracking
-- Free tier: 15 likes/day, 35 dislikes/day, unlimited views/skips

ALTER TABLE users ADD COLUMN daily_likes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_likes_reset_at TEXT;
ALTER TABLE users ADD COLUMN daily_dislikes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_dislikes_reset_at TEXT;

-- Migrate existing swipe data into likes (conservative approach)
UPDATE users SET daily_likes_used = daily_swipes_used WHERE daily_swipes_used > 0;
UPDATE users SET daily_likes_reset_at = daily_swipes_reset_at WHERE daily_swipes_reset_at IS NOT NULL;

-- Index for fast cleanup queries
CREATE INDEX IF NOT EXISTS idx_users_daily_likes_reset ON users(daily_likes_reset_at);
CREATE INDEX IF NOT EXISTS idx_users_daily_dislikes_reset ON users(daily_dislikes_reset_at);
