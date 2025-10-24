-- Insert content warning tags only
-- Run this if the main migration isn't inserting content warnings

INSERT INTO tags (slug, name, tag_type, categories, display_order) VALUES
    ('graphic-violence', 'Graphic Violence', 'content_warning', ARRAY[]::text[], 200),
    ('sexual-content', 'Sexual Content', 'content_warning', ARRAY[]::text[], 201),
    ('dark-themes', 'Dark Themes', 'content_warning', ARRAY[]::text[], 202),
    ('profanity', 'Profanity', 'content_warning', ARRAY[]::text[], 203),
    ('trigger-warnings', 'Common Trigger Warnings', 'content_warning', ARRAY[]::text[], 204);

-- Verify
SELECT * FROM tags WHERE tag_type = 'content_warning' ORDER BY display_order;
