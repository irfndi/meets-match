-- Add birth_date column to users table
-- Age will be computed from birth_date and cached in the age column

ALTER TABLE users ADD COLUMN birth_date TEXT;

-- Create index for birth_date queries
CREATE INDEX IF NOT EXISTS idx_users_birth_date ON users(birth_date);
