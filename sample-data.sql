-- Sample Data for Fiction Recommendation System
-- Run this after running schema.sql

-- Clear existing data (if any)
TRUNCATE TABLE story_follows, story_tags, stories, author_profiles CASCADE;

-- Insert sample authors (let IDs auto-generate)
INSERT INTO author_profiles (pen_name, bio) VALUES
    ('Sarah Chen', 'Award-winning fantasy author'),
    ('Marcus Rodriguez', 'Science fiction enthusiast'),
    ('Emily Thompson', 'Romance and contemporary fiction writer'),
    ('James Wilson', 'Mystery and thriller specialist'),
    ('Aria Blackwood', 'Dark fantasy and horror author'),
    ('David Park', 'Historical fiction writer'),
    ('Luna Sterling', 'Urban fantasy creator'),
    ('Alex Morgan', 'Dystopian and sci-fi author');

-- Insert sample stories (let IDs auto-generate)
INSERT INTO stories (title, slug, summary, author_profile_id, published_at, created_at) VALUES
    ('The Crystal Kingdom', 'the-crystal-kingdom', 'A young mage discovers an ancient kingdom hidden within magical crystals, where she must unite warring factions to prevent a catastrophic spell.', 1, '2024-11-15', NOW()),
    ('Starship Meridian', 'starship-meridian', 'When the colony ship Meridian encounters an alien artifact, the crew must decide whether to investigate or continue their 200-year journey home.', 2, '2024-10-22', NOW()),
    ('Love in the Time of Code', 'love-in-time-of-code', 'Two rival software developers find themselves partnered on a high-stakes project, where bugs aren''t the only thing getting fixed.', 3, '2024-12-01', NOW()),
    ('The Missing Heirloom', 'the-missing-heirloom', 'Detective Sarah Blake must solve the theft of a priceless family heirloom before the victim''s wedding day, uncovering secrets that span generations.', 4, '2024-09-30', NOW()),
    ('Whispers in the Dark', 'whispers-in-the-dark', 'A paranormal investigator moves into a haunted Victorian mansion, only to discover the ghosts are trying to warn her of a greater danger.', 5, '2024-10-31', NOW()),
    ('The Last Samurai''s Daughter', 'the-last-samurais-daughter', 'In 1870s Japan, a samurai''s daughter must navigate the changing world while honoring her father''s legacy and forging her own path.', 6, '2024-08-20', NOW()),
    ('Urban Shadows', 'urban-shadows', 'A witch running a coffee shop in modern Seattle must hide her powers while solving magical crimes that threaten to expose the supernatural community.', 7, '2024-11-28', NOW()),
    ('The Fallen Cities', 'the-fallen-cities', 'In a post-apocalyptic world where cities float in the sky, a scavenger discovers the truth about why humanity fled the ground centuries ago.', 8, '2024-07-15', NOW()),
    ('Echoes of Eternity', 'echoes-of-eternity', 'A time traveler becomes stuck in a loop, reliving the same week where she must prevent her own murder while falling in love with the detective investigating her case.', 2, '2024-12-10', NOW()),
    ('The Dragon''s Apprentice', 'the-dragons-apprentice', 'When dragons return to the realm after a thousand years, a young blacksmith is chosen as the first dragon rider in generations.', 1, '2024-06-12', NOW()),
    ('Midnight at the Crossroads', 'midnight-at-the-crossroads', 'A small-town journalist investigates disappearances at a lonely crossroads, uncovering a portal to a realm where deals with demons are currency.', 5, '2024-09-15', NOW()),
    ('The Quantum Paradox', 'the-quantum-paradox', 'A physicist''s experiment accidentally merges parallel universes, forcing her to work with her alternate selves to restore reality before it collapses.', 2, '2024-11-05', NOW()),
    ('Crowned in Thorns', 'crowned-in-thorns', 'A reluctant princess must marry her kingdom''s enemy to prevent war, but discovers the enemy prince is hiding secrets that could save both kingdoms.', 3, '2024-10-08', NOW()),
    ('The Silent Witness', 'the-silent-witness', 'A deaf forensic artist becomes the only witness to a murder, using her unique perspective to help catch a killer no one else can identify.', 4, '2024-08-25', NOW()),
    ('Neon Dreams', 'neon-dreams', 'In a cyberpunk megacity, a hacker uncovers a corporate conspiracy while falling for the AI designed to stop her.', 8, '2024-12-03', NOW()),
    ('The Witch''s Garden', 'the-witchs-garden', 'A modern witch opens a magical botanical garden, but her plants start granting wishes with dangerous consequences.', 7, '2024-07-20', NOW()),
    ('Blood of the Ancients', 'blood-of-the-ancients', 'When vampires reveal themselves to the world, a human negotiator must broker peace while hiding her own supernatural heritage.', 5, '2024-09-01', NOW()),
    ('The Cartographer''s Secret', 'the-cartographers-secret', 'A mapmaker in Renaissance Italy discovers her maps can alter reality, making her the target of powerful forces seeking to control the world.', 6, '2024-06-30', NOW()),
    ('Station Zero', 'station-zero', 'On a space station at the edge of known space, a security officer must solve a locked-room murder with no suspects and no escape.', 2, '2024-11-18', NOW()),
    ('The Phoenix Rising', 'the-phoenix-rising', 'In a world where magic users are hunted, a fire mage must hide her growing powers while leading a rebellion to free her people.', 1, '2024-08-05', NOW());

-- Insert story-tag relationships (giving each story multiple relevant tags)
INSERT INTO story_tags (story_id, tag_id) VALUES
    -- The Crystal Kingdom (fantasy, adventure)
    (1, (SELECT id FROM tags WHERE slug = 'fantasy')),
    (1, (SELECT id FROM tags WHERE slug = 'adventure')),

    -- Starship Meridian (sci-fi, adventure, thriller)
    (2, (SELECT id FROM tags WHERE slug = 'sci-fi')),
    (2, (SELECT id FROM tags WHERE slug = 'adventure')),
    (2, (SELECT id FROM tags WHERE slug = 'thriller')),

    -- Love in the Time of Code (romance, contemporary)
    (3, (SELECT id FROM tags WHERE slug = 'romance')),
    (3, (SELECT id FROM tags WHERE slug = 'contemporary')),

    -- The Missing Heirloom (mystery, thriller)
    (4, (SELECT id FROM tags WHERE slug = 'mystery')),
    (4, (SELECT id FROM tags WHERE slug = 'thriller')),

    -- Whispers in the Dark (horror, paranormal, mystery)
    (5, (SELECT id FROM tags WHERE slug = 'horror')),
    (5, (SELECT id FROM tags WHERE slug = 'paranormal')),
    (5, (SELECT id FROM tags WHERE slug = 'mystery')),

    -- The Last Samurai's Daughter (historical, adventure)
    (6, (SELECT id FROM tags WHERE slug = 'historical')),
    (6, (SELECT id FROM tags WHERE slug = 'adventure')),

    -- Urban Shadows (urban-fantasy, mystery, paranormal)
    (7, (SELECT id FROM tags WHERE slug = 'urban-fantasy')),
    (7, (SELECT id FROM tags WHERE slug = 'mystery')),
    (7, (SELECT id FROM tags WHERE slug = 'paranormal')),

    -- The Fallen Cities (dystopian, sci-fi, adventure)
    (8, (SELECT id FROM tags WHERE slug = 'dystopian')),
    (8, (SELECT id FROM tags WHERE slug = 'sci-fi')),
    (8, (SELECT id FROM tags WHERE slug = 'adventure')),

    -- Echoes of Eternity (sci-fi, romance, thriller)
    (9, (SELECT id FROM tags WHERE slug = 'sci-fi')),
    (9, (SELECT id FROM tags WHERE slug = 'romance')),
    (9, (SELECT id FROM tags WHERE slug = 'thriller')),

    -- The Dragon's Apprentice (fantasy, adventure)
    (10, (SELECT id FROM tags WHERE slug = 'fantasy')),
    (10, (SELECT id FROM tags WHERE slug = 'adventure')),

    -- Midnight at the Crossroads (horror, paranormal, thriller)
    (11, (SELECT id FROM tags WHERE slug = 'horror')),
    (11, (SELECT id FROM tags WHERE slug = 'paranormal')),
    (11, (SELECT id FROM tags WHERE slug = 'thriller')),

    -- The Quantum Paradox (sci-fi, thriller)
    (12, (SELECT id FROM tags WHERE slug = 'sci-fi')),
    (12, (SELECT id FROM tags WHERE slug = 'thriller')),

    -- Crowned in Thorns (fantasy, romance)
    (13, (SELECT id FROM tags WHERE slug = 'fantasy')),
    (13, (SELECT id FROM tags WHERE slug = 'romance')),

    -- The Silent Witness (mystery, thriller, contemporary)
    (14, (SELECT id FROM tags WHERE slug = 'mystery')),
    (14, (SELECT id FROM tags WHERE slug = 'thriller')),
    (14, (SELECT id FROM tags WHERE slug = 'contemporary')),

    -- Neon Dreams (dystopian, sci-fi, romance)
    (15, (SELECT id FROM tags WHERE slug = 'dystopian')),
    (15, (SELECT id FROM tags WHERE slug = 'sci-fi')),
    (15, (SELECT id FROM tags WHERE slug = 'romance')),

    -- The Witch's Garden (urban-fantasy, paranormal, contemporary)
    (16, (SELECT id FROM tags WHERE slug = 'urban-fantasy')),
    (16, (SELECT id FROM tags WHERE slug = 'paranormal')),
    (16, (SELECT id FROM tags WHERE slug = 'contemporary')),

    -- Blood of the Ancients (paranormal, thriller, romance)
    (17, (SELECT id FROM tags WHERE slug = 'paranormal')),
    (17, (SELECT id FROM tags WHERE slug = 'thriller')),
    (17, (SELECT id FROM tags WHERE slug = 'romance')),

    -- The Cartographer's Secret (historical, fantasy, adventure)
    (18, (SELECT id FROM tags WHERE slug = 'historical')),
    (18, (SELECT id FROM tags WHERE slug = 'fantasy')),
    (18, (SELECT id FROM tags WHERE slug = 'adventure')),

    -- Station Zero (sci-fi, mystery, thriller)
    (19, (SELECT id FROM tags WHERE slug = 'sci-fi')),
    (19, (SELECT id FROM tags WHERE slug = 'mystery')),
    (19, (SELECT id FROM tags WHERE slug = 'thriller')),

    -- The Phoenix Rising (fantasy, dystopian, adventure)
    (20, (SELECT id FROM tags WHERE slug = 'fantasy')),
    (20, (SELECT id FROM tags WHERE slug = 'dystopian')),
    (20, (SELECT id FROM tags WHERE slug = 'adventure'));

-- Insert sample story follows (to simulate popularity)
INSERT INTO story_follows (story_id, user_id) VALUES
    -- Make some stories more popular than others
    -- The Crystal Kingdom (very popular - 150 followers)
    (1, generate_series(1, 150)),

    -- Starship Meridian (popular - 120 followers)
    (2, generate_series(1, 120)),

    -- Love in the Time of Code (moderately popular - 85 followers)
    (3, generate_series(1, 85)),

    -- The Missing Heirloom (60 followers)
    (4, generate_series(1, 60)),

    -- Whispers in the Dark (100 followers)
    (5, generate_series(1, 100)),

    -- The Last Samurai's Daughter (45 followers)
    (6, generate_series(1, 45)),

    -- Urban Shadows (130 followers)
    (7, generate_series(1, 130)),

    -- The Fallen Cities (95 followers)
    (8, generate_series(1, 95)),

    -- Echoes of Eternity (110 followers)
    (9, generate_series(1, 110)),

    -- The Dragon's Apprentice (160 followers - most popular)
    (10, generate_series(1, 160)),

    -- Midnight at the Crossroads (70 followers)
    (11, generate_series(1, 70)),

    -- The Quantum Paradox (80 followers)
    (12, generate_series(1, 80)),

    -- Crowned in Thorns (105 followers)
    (13, generate_series(1, 105)),

    -- The Silent Witness (55 followers)
    (14, generate_series(1, 55)),

    -- Neon Dreams (90 followers)
    (15, generate_series(1, 90)),

    -- The Witch's Garden (75 followers)
    (16, generate_series(1, 75)),

    -- Blood of the Ancients (115 followers)
    (17, generate_series(1, 115)),

    -- The Cartographer's Secret (50 followers)
    (18, generate_series(1, 50)),

    -- Station Zero (125 followers)
    (19, generate_series(1, 125)),

    -- The Phoenix Rising (140 followers)
    (20, generate_series(1, 140));

-- Verify the data
SELECT 'Sample data inserted successfully!' as status;
SELECT COUNT(*) as author_count FROM author_profiles;
SELECT COUNT(*) as story_count FROM stories;
SELECT COUNT(*) as tag_count FROM tags;
SELECT COUNT(*) as story_tag_relationships FROM story_tags;
SELECT story_id, followers FROM v_story_follow_counts ORDER BY followers DESC LIMIT 10;
