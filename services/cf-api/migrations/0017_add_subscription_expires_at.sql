-- Add subscription expiry tracking
ALTER TABLE users ADD COLUMN subscription_expires_at TEXT;

-- Index for the cron job that downgrades expired subscriptions
CREATE INDEX idx_users_subscription_expires ON users(subscription_expires_at)
WHERE subscription_tier IN ('premium', 'premium_plus');
