-- D1 (SQLite) schema: Notification delivery attempts table
-- Ported from PostgreSQL 000003_add_notifications.up.sql:44-57

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
