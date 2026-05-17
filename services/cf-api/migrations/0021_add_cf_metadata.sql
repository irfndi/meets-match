-- Add missing cf_metadata column to error_reports
ALTER TABLE error_reports ADD COLUMN cf_metadata TEXT;
