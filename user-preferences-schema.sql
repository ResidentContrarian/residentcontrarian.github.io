-- User Tag Preferences Schema
-- Run this migration after the main schema.sql

-- User liked tags: Many-to-many relationship between users and tags they like
CREATE TABLE user_liked_tags (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tag_id)
);

-- User excluded tags: Many-to-many relationship between users and tags they want to exclude
CREATE TABLE user_excluded_tags (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tag_id)
);

-- User combination tags: Stores tag combinations (e.g., "military" + "sci-fi")
CREATE TABLE user_combo_tags (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    tag1_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    tag2_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tag1_id, tag2_id),
    -- Ensure tag1 and tag2 are different
    CHECK (tag1_id != tag2_id)
);

-- Indexes for better query performance
CREATE INDEX idx_user_liked_tags_user ON user_liked_tags(user_id);
CREATE INDEX idx_user_liked_tags_tag ON user_liked_tags(tag_id);
CREATE INDEX idx_user_excluded_tags_user ON user_excluded_tags(user_id);
CREATE INDEX idx_user_excluded_tags_tag ON user_excluded_tags(tag_id);
CREATE INDEX idx_user_combo_tags_user ON user_combo_tags(user_id);

-- Verify the schema
SELECT 'User preferences schema created successfully!' as status;
