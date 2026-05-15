-- Add media_urls (images + videos), inactivity tracking, and cleanup fields

-- Media storage: JSON array of {url, type, uploadedAt}
ALTER TABLE users ADD COLUMN media_urls TEXT DEFAULT '[]';

-- Inactivity / cleanup tracking
ALTER TABLE users ADD COLUMN hidden_from_matches INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN media_deleted_at TEXT;
ALTER TABLE users ADD COLUMN last_interaction_at TEXT;
UPDATE users SET last_interaction_at = CURRENT_TIMESTAMP;

-- Backfill: migrate existing photos JSON array strings into media_urls format
-- Old photos: ["url1", "url2"] → New media_urls: [{"url":"url1","type":"image","uploadedAt":""}]
UPDATE users SET media_urls = CASE
  WHEN photos = '[]' OR photos IS NULL THEN '[]'
  ELSE (
    SELECT json_group_array(
      json_object('url', value, 'type', 'image', 'uploadedAt', created_at)
    )
    FROM json_each(photos)
  )
END;

-- Indexes for cleanup and matching queries
CREATE INDEX IF NOT EXISTS idx_users_last_interaction ON users(last_interaction_at);
CREATE INDEX IF NOT EXISTS idx_users_hidden_from_matches ON users(hidden_from_matches);
