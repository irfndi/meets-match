CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user1_action TEXT DEFAULT 'none',
    user2_action TEXT DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'pending',
    score TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    matched_at TEXT,
    CONSTRAINT unique_user_pair UNIQUE(user1_id, user2_id),
    CONSTRAINT different_users CHECK (user1_id != user2_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user1_id ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2_id ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_matched_at ON matches(matched_at DESC) WHERE matched_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_users ON matches(user1_id, user2_id);
