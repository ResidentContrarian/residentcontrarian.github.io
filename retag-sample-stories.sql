-- Re-tag sample stories with new hierarchical tag structure
-- Run this after running tag-taxonomy-migration.sql

-- Story 1: The Crystal Kingdom (Epic Fantasy)
INSERT INTO story_tags (story_id, tag_id)
SELECT 1, id FROM tags WHERE slug IN ('epic-fantasy', 'dark-fantasy');

-- Story 2: Starship Meridian (Space Opera)
INSERT INTO story_tags (story_id, tag_id)
SELECT 2, id FROM tags WHERE slug IN ('space-opera', 'hard-scifi');

-- Story 3: Love in the Time of Code (Contemporary Romance)
INSERT INTO story_tags (story_id, tag_id)
SELECT 3, id FROM tags WHERE slug IN ('contemporary-romance');

-- Story 4: The Missing Heirloom (Cozy Fantasy)
INSERT INTO story_tags (story_id, tag_id)
SELECT 4, id FROM tags WHERE slug IN ('cozy-fantasy');

-- Story 5: Whispers in the Dark (Psychological Horror)
INSERT INTO story_tags (story_id, tag_id)
SELECT 5, id FROM tags WHERE slug IN ('psychological-horror', 'dark-themes');

-- Story 6: The Last Samurai's Daughter (Historical Romance)
INSERT INTO story_tags (story_id, tag_id)
SELECT 6, id FROM tags WHERE slug IN ('historical-romance');

-- Story 7: Urban Shadows (Urban Fantasy)
INSERT INTO story_tags (story_id, tag_id)
SELECT 7, id FROM tags WHERE slug IN ('urban-fantasy', 'dark-fantasy');

-- Story 8: The Fallen Cities (Dystopian)
INSERT INTO story_tags (story_id, tag_id)
SELECT 8, id FROM tags WHERE slug IN ('dystopian');

-- Story 9: Echoes of Eternity (Paranormal Romance)
INSERT INTO story_tags (story_id, tag_id)
SELECT 9, id FROM tags WHERE slug IN ('paranormal-romance', 'romance-fantasy');

-- Story 10: The Dragon's Apprentice (Epic Fantasy)
INSERT INTO story_tags (story_id, tag_id)
SELECT 10, id FROM tags WHERE slug IN ('epic-fantasy', 'cozy-fantasy');

-- Story 11: Midnight at the Crossroads (Horror Fantasy - cross category)
INSERT INTO story_tags (story_id, tag_id)
SELECT 11, id FROM tags WHERE slug IN ('horror-fantasy', 'dark-fantasy', 'gothic-horror');

-- Story 12: The Quantum Paradox (Hard Sci-Fi)
INSERT INTO story_tags (story_id, tag_id)
SELECT 12, id FROM tags WHERE slug IN ('hard-scifi');

-- Story 13: Crowned in Thorns (Dark Fantasy)
INSERT INTO story_tags (story_id, tag_id)
SELECT 13, id FROM tags WHERE slug IN ('dark-fantasy', 'epic-fantasy');

-- Story 14: The Silent Witness (Psychological Horror)
INSERT INTO story_tags (story_id, tag_id)
SELECT 14, id FROM tags WHERE slug IN ('psychological-horror');

-- Story 15: Neon Dreams (Cyberpunk)
INSERT INTO story_tags (story_id, tag_id)
SELECT 15, id FROM tags WHERE slug IN ('cyberpunk');

-- Story 16: The Witch's Garden (Cozy Fantasy)
INSERT INTO story_tags (story_id, tag_id)
SELECT 16, id FROM tags WHERE slug IN ('cozy-fantasy');

-- Story 17: Blood of the Ancients (Epic Fantasy with violence)
INSERT INTO story_tags (story_id, tag_id)
SELECT 17, id FROM tags WHERE slug IN ('epic-fantasy', 'dark-fantasy', 'graphic-violence');

-- Story 18: The Cartographer's Secret (Cozy Fantasy)
INSERT INTO story_tags (story_id, tag_id)
SELECT 18, id FROM tags WHERE slug IN ('cozy-fantasy');

-- Story 19: Station Zero (Space Opera)
INSERT INTO story_tags (story_id, tag_id)
SELECT 19, id FROM tags WHERE slug IN ('space-opera');

-- Story 20: The Phoenix Rising (Epic Fantasy + LGBTQ)
INSERT INTO story_tags (story_id, tag_id)
SELECT 20, id FROM tags WHERE slug IN ('epic-fantasy', 'lgbtq-fantasy', 'queer-fantasy');

-- Verify tagging
SELECT
    s.id,
    s.title,
    COUNT(st.id) as tag_count,
    STRING_AGG(t.name, ', ') as tags
FROM stories s
LEFT JOIN story_tags st ON s.id = st.story_id
LEFT JOIN tags t ON st.tag_id = t.id
GROUP BY s.id, s.title
ORDER BY s.id;

SELECT 'Stories re-tagged successfully!' as status;
