-- Tag Taxonomy Migration: Hierarchical Genre System
-- This adds structure for categories, sub-genres, and cross-category tags

-- Add new columns to tags table
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tag_type VARCHAR(50) DEFAULT 'sub_genre';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_master_switch BOOLEAN DEFAULT false;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 999;

-- Clear existing tags (we'll rebuild with new structure)
TRUNCATE TABLE story_tags CASCADE;
DELETE FROM tags;

-- Insert top-level category master switches
INSERT INTO tags (slug, name, tag_type, categories, is_master_switch, display_order) VALUES
    ('all-fantasy', 'All Fantasy', 'master_switch', ARRAY['fantasy'], true, 1),
    ('all-scifi', 'All Sci-Fi', 'master_switch', ARRAY['scifi'], true, 2),
    ('all-romance', 'All Romance', 'master_switch', ARRAY['romance'], true, 3),
    ('all-horror', 'All Horror', 'master_switch', ARRAY['horror'], true, 4),
    ('all-lgbtq', 'All LGBTQ+', 'master_switch', ARRAY['lgbtq'], true, 5);

-- Insert Fantasy sub-genres
INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('cozy-fantasy', 'Cozy Fantasy', 'sub_genre', ARRAY['fantasy'], 10),
    ('dark-fantasy', 'Dark Fantasy', 'sub_genre', ARRAY['fantasy'], 11),
    ('epic-fantasy', 'Epic Fantasy', 'sub_genre', ARRAY['fantasy'], 12),
    ('urban-fantasy', 'Urban Fantasy', 'sub_genre', ARRAY['fantasy'], 13);

-- Insert Sci-Fi sub-genres
INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('space-opera', 'Space Opera', 'sub_genre', ARRAY['scifi'], 20),
    ('cyberpunk', 'Cyberpunk', 'sub_genre', ARRAY['scifi'], 21),
    ('hard-scifi', 'Hard Sci-Fi', 'sub_genre', ARRAY['scifi'], 22),
    ('dystopian', 'Dystopian', 'sub_genre', ARRAY['scifi'], 23);

-- Insert Romance sub-genres
INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('contemporary-romance', 'Contemporary Romance', 'sub_genre', ARRAY['romance'], 30),
    ('historical-romance', 'Historical Romance', 'sub_genre', ARRAY['romance'], 31),
    ('paranormal-romance', 'Paranormal Romance', 'sub_genre', ARRAY['romance'], 32);

-- Insert Horror sub-genres
INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('psychological-horror', 'Psychological Horror', 'sub_genre', ARRAY['horror'], 40),
    ('cosmic-horror', 'Cosmic Horror', 'sub_genre', ARRAY['horror'], 41),
    ('gothic-horror', 'Gothic Horror', 'sub_genre', ARRAY['horror'], 42);

-- Insert LGBTQ+ sub-genres
INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('mm-romance', 'M/M Romance', 'sub_genre', ARRAY['lgbtq'], 50),
    ('ff-romance', 'F/F Romance', 'sub_genre', ARRAY['lgbtq'], 51),
    ('trans-protagonist', 'Trans Protagonist', 'sub_genre', ARRAY['lgbtq'], 52),
    ('queer-fantasy', 'Queer Fantasy', 'sub_genre', ARRAY['lgbtq'], 53);

-- Insert cross-category combos (appear in multiple boxes)
INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('romance-fantasy', 'Romance Fantasy', 'cross_category', ARRAY['romance', 'fantasy'], 100),
    ('romance-scifi', 'Romance Sci-Fi', 'cross_category', ARRAY['romance', 'scifi'], 101),
    ('horror-fantasy', 'Horror Fantasy', 'cross_category', ARRAY['horror', 'fantasy'], 102),
    ('lgbtq-romance', 'LGBTQ+ Romance', 'cross_category', ARRAY['lgbtq', 'romance'], 103),
    ('lgbtq-fantasy', 'LGBTQ+ Fantasy', 'cross_category', ARRAY['lgbtq', 'fantasy'], 104),
    ('lgbtq-scifi', 'LGBTQ+ Sci-Fi', 'cross_category', ARRAY['lgbtq', 'scifi'], 105);

-- Insert content warning tags (for Phase 3)
INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('graphic-violence', 'Graphic Violence', 'content_warning', ARRAY[], 200),
    ('sexual-content', 'Sexual Content', 'content_warning', ARRAY[], 201),
    ('dark-themes', 'Dark Themes', 'content_warning', ARRAY[], 202),
    ('profanity', 'Profanity', 'content_warning', ARRAY[], 203),
    ('trigger-warnings', 'Common Trigger Warnings', 'content_warning', ARRAY[], 204);

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(tag_type);
CREATE INDEX IF NOT EXISTS idx_tags_categories ON tags USING GIN(categories);

-- Verify
SELECT 'Tag taxonomy created successfully!' as status;
SELECT tag_type, COUNT(*) as count FROM tags GROUP BY tag_type ORDER BY tag_type;
