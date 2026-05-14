-- D1 (SQLite) schema: Initial users table
-- Ported from PostgreSQL 000001_init_schema.up.sql

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT,
    bio TEXT,
    age INTEGER,
    gender TEXT,
    interests TEXT DEFAULT '[]',      -- JSON array
    photos TEXT DEFAULT '[]',         -- JSON array
    location TEXT DEFAULT '{}',       -- JSON object
    preferences TEXT DEFAULT '{}',    -- JSON object
    is_active INTEGER DEFAULT 1,
    is_sleeping INTEGER DEFAULT 0,
    is_profile_complete INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_active TEXT DEFAULT CURRENT_TIMESTAMP,
    last_reminded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_age ON users(age);
CREATE INDEX IF NOT EXISTS idx_users_gender ON users(gender);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_is_sleeping ON users(is_sleeping);
