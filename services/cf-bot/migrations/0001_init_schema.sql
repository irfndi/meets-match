CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    display_name TEXT NOT NULL,
    last_name TEXT,
    bio TEXT,
    age INTEGER,
    gender TEXT,
    interests TEXT DEFAULT '[]',
    photos TEXT DEFAULT '[]',
    location TEXT DEFAULT '{}',
    preferences TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    is_sleeping INTEGER DEFAULT 0,
    is_profile_complete INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_active TEXT DEFAULT (datetime('now')),
    last_reminded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_age ON users(age);
CREATE INDEX IF NOT EXISTS idx_users_gender ON users(gender);

CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'rejected')),
    score TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    matched_at TEXT,
    user1_action TEXT DEFAULT 'none',
    user2_action TEXT DEFAULT 'none'
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('mutual_match', 'new_like', 'match_reminder', 'profile_incomplete', 'welcome', 'system')),
    channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'email', 'push', 'sms')),
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dlq', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TEXT,
    last_error TEXT,
    last_error_code TEXT,
    related_match_id TEXT REFERENCES matches(id) ON DELETE SET NULL,
    related_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    delivered_at TEXT,
    dlq_at TEXT,
    idempotency_key TEXT UNIQUE,
    expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

CREATE TABLE IF NOT EXISTS notification_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    attempted_at TEXT DEFAULT (datetime('now')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'retry')),
    error_message TEXT,
    error_code TEXT,
    duration_ms INTEGER,
    metadata TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_notification_attempts_notification ON notification_attempts(notification_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);
