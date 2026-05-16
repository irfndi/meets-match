-- Add error_reports table for bot error reports
CREATE TABLE IF NOT EXISTS error_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  trace_id TEXT,
  message TEXT,
  journey TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_error_reports_reporter ON error_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_error_reports_status ON error_reports(status);
CREATE INDEX IF NOT EXISTS idx_error_reports_created_at ON error_reports(created_at);
