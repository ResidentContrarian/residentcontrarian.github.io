-- Repopulate story_follows with fake follower data
-- This gives stories follower counts for ranking purposes

-- First, create fake users in the users table (required for foreign key)
-- These simulate followers; in production, these would be real Clerk user IDs
INSERT INTO users (id, username, display_name, email)
SELECT
    'fake_user_' || generate_series,
    'fakeuser' || generate_series,
    'Fake User ' || generate_series,
    'fake' || generate_series || '@example.com'
FROM generate_series(1, 200);

-- Now generate follows for each story with varying popularity
-- Story 1: The Crystal Kingdom (150 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 1, 'fake_user_' || generate_series(1, 150);

-- Story 2: Starship Meridian (120 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 2, 'fake_user_' || generate_series(1, 120);

-- Story 3: Love in the Time of Code (85 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 3, 'fake_user_' || generate_series(1, 85);

-- Story 4: The Missing Heirloom (60 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 4, 'fake_user_' || generate_series(1, 60);

-- Story 5: Whispers in the Dark (100 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 5, 'fake_user_' || generate_series(1, 100);

-- Story 6: The Last Samurai's Daughter (45 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 6, 'fake_user_' || generate_series(1, 45);

-- Story 7: Urban Shadows (130 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 7, 'fake_user_' || generate_series(1, 130);

-- Story 8: The Fallen Cities (95 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 8, 'fake_user_' || generate_series(1, 95);

-- Story 9: Echoes of Eternity (110 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 9, 'fake_user_' || generate_series(1, 110);

-- Story 10: The Dragon's Apprentice (160 followers - most popular)
INSERT INTO story_follows (story_id, user_id)
SELECT 10, 'fake_user_' || generate_series(1, 160);

-- Story 11: Midnight at the Crossroads (70 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 11, 'fake_user_' || generate_series(1, 70);

-- Story 12: The Quantum Paradox (80 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 12, 'fake_user_' || generate_series(1, 80);

-- Story 13: Crowned in Thorns (105 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 13, 'fake_user_' || generate_series(1, 105);

-- Story 14: The Silent Witness (55 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 14, 'fake_user_' || generate_series(1, 55);

-- Story 15: Neon Dreams (90 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 15, 'fake_user_' || generate_series(1, 90);

-- Story 16: The Witch's Garden (75 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 16, 'fake_user_' || generate_series(1, 75);

-- Story 17: Blood of the Ancients (115 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 17, 'fake_user_' || generate_series(1, 115);

-- Story 18: The Cartographer's Secret (50 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 18, 'fake_user_' || generate_series(1, 50);

-- Story 19: Station Zero (125 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 19, 'fake_user_' || generate_series(1, 125);

-- Story 20: The Phoenix Rising (140 followers)
INSERT INTO story_follows (story_id, user_id)
SELECT 20, 'fake_user_' || generate_series(1, 140);

-- Verify follower counts
SELECT
    s.title,
    COUNT(sf.id) as followers
FROM stories s
LEFT JOIN story_follows sf ON s.id = sf.story_id
GROUP BY s.id, s.title
ORDER BY followers DESC;

SELECT 'Story follows repopulated successfully!' as status;
