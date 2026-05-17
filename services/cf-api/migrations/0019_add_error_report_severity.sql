-- Add severity and alert tracking to error_reports for admin notifications
ALTER TABLE error_reports ADD COLUMN severity TEXT DEFAULT 'low' CHECK (severity IN ('high', 'low'));
ALTER TABLE error_reports ADD COLUMN alert_sent INTEGER DEFAULT 0;
ALTER TABLE error_reports ADD COLUMN source TEXT;

CREATE INDEX IF NOT EXISTS idx_error_reports_severity ON error_reports(severity);
CREATE INDEX IF NOT EXISTS idx_error_reports_alert_sent ON error_reports(alert_sent);
CREATE INDEX IF NOT EXISTS idx_error_reports_severity_created ON error_reports(severity, created_at);
