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

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TEXT,
    dlq_at TEXT,

    idempotency_key TEXT UNIQUE,

    expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_next_retry_at ON notifications(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notifications_related_match ON notifications(related_match_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_user ON notifications(related_user_id);

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'retry')),
    error_message TEXT,
    error_code TEXT,
    duration_ms INTEGER,
    metadata TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_notification ON notification_delivery_attempts(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_status ON notification_delivery_attempts(status);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_attempted_at ON notification_delivery_attempts(attempted_at);
