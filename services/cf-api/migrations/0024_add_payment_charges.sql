-- Durable payment charge records so replayed Telegram successful_payment
-- webhook deliveries cannot double-grant entitlements. The charge_id is
-- unique per Telegram payment; UNIQUE(charge_id) makes the claim exclusive
-- and the entitlement grant is applied in the same D1 batch so a failed
-- grant rolls back the claim and a retry can re-attempt.

CREATE TABLE payment_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  charge_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, -- 'dm_credit' | 'premium' | 'gift_premium'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payment_charges_user ON payment_charges(user_id);
