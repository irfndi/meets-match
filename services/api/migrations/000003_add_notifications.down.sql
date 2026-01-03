-- Archive notifications before dropping
-- Create archive tables and move data if source tables exist
DO $$
BEGIN
  -- Create notifications_archive and copy data if notifications exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
    CREATE TABLE IF NOT EXISTS notifications_archive (
        LIKE notifications INCLUDING ALL
    );
    INSERT INTO notifications_archive
    SELECT * FROM notifications
    ON CONFLICT DO NOTHING;
  END IF;

  -- Create notification_attempts_archive and copy data if notification_attempts exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notification_attempts') THEN
    CREATE TABLE IF NOT EXISTS notification_attempts_archive (
        LIKE notification_attempts INCLUDING ALL
    );
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
