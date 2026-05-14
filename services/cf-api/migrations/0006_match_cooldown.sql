-- Match cooldown, profile views, and pending likes support

-- Track which profiles have been shown to which users (for variety)
CREATE TABLE IF NOT EXISTS profile_views (
    viewer_id TEXT NOT NULL,
    viewed_id TEXT NOT NULL,
    viewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (viewer_id, viewed_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_at ON profile_views(viewed_at);

-- Add cooldown tracking columns to matches
-- Using updated_at for cooldown timing, but add last_shown_at for re-engagement
ALTER TABLE matches ADD COLUMN last_shown_at TEXT;
