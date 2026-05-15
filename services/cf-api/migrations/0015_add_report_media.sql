-- Add media_url column for report evidence (screenshots/videos)
ALTER TABLE reports ADD COLUMN media_url TEXT;

-- Add feedback table for general bug reports / user feedback
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT DEFAULT 'bug' CHECK (type IN ('bug', 'feature', 'other')),
  message TEXT,
  media_url TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
