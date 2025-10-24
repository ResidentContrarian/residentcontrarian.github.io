-- Database Schema for Fiction Recommendation System
-- This schema matches the queries used in lib/db.js

-- Tags table: Stores fiction genre tags
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,  -- URL-friendly identifier (e.g., 'fantasy', 'sci-fi')
    name VARCHAR(100) NOT NULL,         -- Display name (e.g., 'Fantasy', 'Science Fiction')
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Author profiles table: Stores author information
CREATE TABLE author_profiles (
    id SERIAL PRIMARY KEY,
    pen_name VARCHAR(255) NOT NULL,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stories table: Stores fiction stories
CREATE TABLE stories (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,  -- URL-friendly identifier
    summary TEXT,                        -- Story description/synopsis
    author_profile_id INTEGER REFERENCES author_profiles(id),
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL    -- Soft delete: NULL means active story
);

-- Story tags junction table: Many-to-many relationship between stories and tags
CREATE TABLE story_tags (
    story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (story_id, tag_id)
);

-- Optional: Users table (referenced but not strictly required for the current implementation)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Story follows table: Tracks which users follow which stories
-- (Must be created BEFORE the view that references it)
CREATE TABLE story_follows (
    id SERIAL PRIMARY KEY,
    story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
    user_id INTEGER,  -- Could reference a users table if you implement user accounts
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(story_id, user_id)
);

-- Story follow counts view: Aggregates follower counts per story
-- Note: This is a materialized view or regular view depending on your needs
CREATE VIEW v_story_follow_counts AS
SELECT
    story_id,
    COUNT(*) as followers
FROM story_follows
GROUP BY story_id;

-- Indexes for better query performance
CREATE INDEX idx_stories_author ON stories(author_profile_id);
CREATE INDEX idx_stories_published ON stories(published_at);
CREATE INDEX idx_stories_deleted ON stories(deleted_at);
CREATE INDEX idx_story_tags_story ON story_tags(story_id);
CREATE INDEX idx_story_tags_tag ON story_tags(tag_id);
CREATE INDEX idx_story_follows_story ON story_follows(story_id);
CREATE INDEX idx_tags_slug ON tags(slug);

-- Sample data to get you started
INSERT INTO tags (slug, name) VALUES
    ('fantasy', 'Fantasy'),
    ('sci-fi', 'Science Fiction'),
    ('romance', 'Romance'),
    ('mystery', 'Mystery'),
    ('thriller', 'Thriller'),
    ('horror', 'Horror'),
    ('adventure', 'Adventure'),
    ('historical', 'Historical Fiction'),
    ('contemporary', 'Contemporary'),
    ('paranormal', 'Paranormal'),
    ('dystopian', 'Dystopian'),
    ('urban-fantasy', 'Urban Fantasy');
