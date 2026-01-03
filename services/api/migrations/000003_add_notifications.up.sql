-- Notification channels supported by the system
-- Extensible: telegram, email, push, sms
CREATE TYPE notification_channel AS ENUM ('telegram', 'email', 'push', 'sms');

-- Notification status lifecycle
CREATE TYPE notification_status AS ENUM (
    'pending',      -- Initial state, awaiting first attempt
    'processing',   -- Currently being processed
    'delivered',    -- Successfully delivered
    'failed',       -- Failed but may retry
    'dlq',          -- Moved to dead letter queue after max retries
    'cancelled'     -- Manually cancelled
);

-- Notification types for different events
CREATE TYPE notification_type AS ENUM (
    'mutual_match',           -- Both users liked each other
    'new_like',               -- Someone liked the user
    'match_reminder',         -- Reminder about pending matches
    'profile_incomplete',     -- Profile completion reminder
    'welcome',                -- Welcome message for new users
    'system'                  -- System announcements
);

-- Main notifications table for audit trail
-- Stores all notification records with their current state
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Target user
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Notification classification
    type notification_type NOT NULL,
    channel notification_channel NOT NULL DEFAULT 'telegram',

    -- Notification content (channel-specific payload)
    -- For Telegram: {chat_id, text, parse_mode, reply_markup}
    -- For Email: {to, subject, body, template_id}
    payload JSONB NOT NULL,

    -- Processing metadata
    status notification_status NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),

    -- Retry tracking
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ,

    -- Error tracking
    last_error TEXT,
    last_error_code VARCHAR(50),

    -- Related entities for context
    related_match_id VARCHAR(255) REFERENCES matches(id) ON DELETE SET NULL,
    related_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    dlq_at TIMESTAMPTZ,

    -- Idempotency key to prevent duplicate notifications
    idempotency_key VARCHAR(255) UNIQUE,

    -- TTL for automatic cleanup (NULL = no expiry)
    expires_at TIMESTAMPTZ
);

-- Notification delivery attempts history
-- Tracks every attempt for debugging and analytics
CREATE TABLE IF NOT EXISTS notification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,

    -- Attempt metadata
    attempt_number INT NOT NULL,

    -- Result
    success BOOLEAN NOT NULL,
    error_message TEXT,
    error_code VARCHAR(50),

    -- Response from the channel (e.g., Telegram API response)
    response_data JSONB,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    -- Worker info for debugging
    worker_id VARCHAR(100)
);

-- Indexes for common query patterns

-- Query: Get pending notifications for processing
CREATE INDEX idx_notifications_pending ON notifications(status, next_retry_at)
    WHERE status IN ('pending', 'failed');

-- Query: Get notifications for a specific user
CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);

-- Query: Get notifications by type for analytics
CREATE INDEX idx_notifications_type_status ON notifications(type, status);

-- Query: Find DLQ items for review
CREATE INDEX idx_notifications_dlq ON notifications(dlq_at DESC)
    WHERE status = 'dlq';

-- Query: Clean up expired notifications
CREATE INDEX idx_notifications_expires ON notifications(expires_at)
    WHERE expires_at IS NOT NULL;

-- Query: Attempts by notification
CREATE INDEX idx_notification_attempts_notification ON notification_attempts(notification_id);

-- Query: Recent notifications by user and type (for deduplication)
CREATE INDEX idx_notifications_user_type_created ON notifications(user_id, type, created_at DESC)
    WHERE status IN ('pending', 'processing', 'delivered');

-- Comments for documentation
COMMENT ON TABLE notifications IS 'Notification queue with full audit trail. Supports multiple channels and retry logic.';
COMMENT ON COLUMN notifications.payload IS 'Channel-specific payload. Structure varies by channel type.';
COMMENT ON COLUMN notifications.idempotency_key IS 'Unique key to prevent duplicate notifications for the same event.';
COMMENT ON COLUMN notifications.priority IS 'Priority level 0-10. Higher priority notifications are processed first.';
COMMENT ON TABLE notification_attempts IS 'Delivery attempt history for each notification. Used for debugging and analytics.';
