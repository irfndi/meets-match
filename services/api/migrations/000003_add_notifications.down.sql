-- Archive notifications before dropping
-- Create archive tables if they don't exist
CREATE TABLE IF NOT EXISTS notifications_archive (
    LIKE notifications INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS notification_attempts_archive (
    LIKE notification_attempts INCLUDING ALL
);

-- Move data to archive tables if source tables exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
    INSERT INTO notifications_archive
    SELECT * FROM notifications
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notification_attempts') THEN
    INSERT INTO notification_attempts_archive
    SELECT * FROM notification_attempts
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Drop tables first (reverse order of creation)
DROP TABLE IF EXISTS notification_attempts;
DROP TABLE IF EXISTS notifications;

-- Drop custom types
DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS notification_status;
DROP TYPE IF EXISTS notification_channel;
