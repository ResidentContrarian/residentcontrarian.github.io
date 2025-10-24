-- Fix users table and story_follows to support Clerk user IDs (VARCHAR instead of SERIAL/INTEGER)
-- Run this BEFORE running user-preferences-schema.sql

-- Drop dependent tables first
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS story_follows CASCADE;

-- Recreate users table with correct type for Clerk IDs
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,  -- Clerk user ID (e.g., 'user_xyz123')
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recreate story_follows table with VARCHAR user_id
CREATE TABLE story_follows (
    id SERIAL PRIMARY KEY,
    story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(story_id, user_id)
);

-- Recreate the view
DROP VIEW IF EXISTS v_story_follow_counts;
CREATE VIEW v_story_follow_counts AS
SELECT
    story_id,
    COUNT(*) as followers
FROM story_follows
GROUP BY story_id;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_story_follows_story ON story_follows(story_id);

-- Verify
SELECT 'Users table and story_follows fixed successfully!' as status;
