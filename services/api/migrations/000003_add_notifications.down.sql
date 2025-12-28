-- Drop tables first (reverse order of creation)
DROP TABLE IF EXISTS notification_attempts;
DROP TABLE IF EXISTS notifications;

-- Drop custom types
DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS notification_status;
DROP TYPE IF EXISTS notification_channel;
