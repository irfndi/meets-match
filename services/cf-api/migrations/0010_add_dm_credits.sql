-- Add DM credits for pay-per-direct-message feature

ALTER TABLE users ADD COLUMN dm_credits INTEGER NOT NULL DEFAULT 0;

-- Update existing supervip users to premium_plus tier
UPDATE users SET subscription_tier = 'premium_plus' WHERE subscription_tier = 'supervip';
