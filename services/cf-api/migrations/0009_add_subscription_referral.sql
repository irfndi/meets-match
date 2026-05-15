-- Subscription tiers, daily swipe limits, and referral system

ALTER TABLE users ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN daily_swipes_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_swipes_reset_at TEXT;
ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN referred_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_bonus_swipes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
