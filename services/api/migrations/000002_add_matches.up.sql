-- Add matches table for match tracking
CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(255) PRIMARY KEY,
    user1_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user1_action VARCHAR(50) DEFAULT 'none',
    user2_action VARCHAR(50) DEFAULT 'none',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    score JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    CONSTRAINT unique_user_pair UNIQUE(user1_id, user2_id),
    CONSTRAINT different_users CHECK (user1_id != user2_id)
);

-- Indexes for efficient querying
CREATE INDEX idx_matches_user1_id ON matches(user1_id);
CREATE INDEX idx_matches_user2_id ON matches(user2_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_matched_at ON matches(matched_at DESC) WHERE matched_at IS NOT NULL;

-- Composite index for finding matches involving a user
CREATE INDEX idx_matches_users ON matches(user1_id, user2_id);

-- Add comment for documentation
COMMENT ON TABLE matches IS 'Stores match records between users with status tracking';
COMMENT ON COLUMN matches.user1_action IS 'Action taken by user1: none, like, dislike, skip';
COMMENT ON COLUMN matches.user2_action IS 'Action taken by user2: none, like, dislike, skip';
COMMENT ON COLUMN matches.status IS 'Match status: pending, matched, rejected, expired';
COMMENT ON COLUMN matches.score IS 'JSON object with total, location, interests, preferences scores';
