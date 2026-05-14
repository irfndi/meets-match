-- Add phone_number and language columns to users table
ALTER TABLE users ADD COLUMN phone_number TEXT;
ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';
