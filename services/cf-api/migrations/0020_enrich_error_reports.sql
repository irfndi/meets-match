-- Enrich error_reports with service versions, stack trace, and user context
-- for debugging across independently-deployed services (bot, worker, API)

ALTER TABLE error_reports ADD COLUMN bot_version TEXT;
ALTER TABLE error_reports ADD COLUMN api_version TEXT;
ALTER TABLE error_reports ADD COLUMN worker_version TEXT;
ALTER TABLE error_reports ADD COLUMN error_stack TEXT;
ALTER TABLE error_reports ADD COLUMN user_language TEXT;
ALTER TABLE error_reports ADD COLUMN user_tier TEXT;
ALTER TABLE error_reports ADD COLUMN trigger_input TEXT;
ALTER TABLE error_reports ADD COLUMN kv_session TEXT;

CREATE INDEX IF NOT EXISTS idx_error_reports_bot_version ON error_reports(bot_version);
CREATE INDEX IF NOT EXISTS idx_error_reports_api_version ON error_reports(api_version);
CREATE INDEX IF NOT EXISTS idx_error_reports_user_language ON error_reports(user_language);
CREATE INDEX IF NOT EXISTS idx_error_reports_user_tier ON error_reports(user_tier);
