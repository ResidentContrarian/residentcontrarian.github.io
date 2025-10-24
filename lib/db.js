import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL);

export async function getAllTags() {
  try {
    const tags = await sql`
      SELECT id, slug, name
      FROM tags
      ORDER BY name ASC
    `;
    return tags;
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
}

export async function getRecommendationsByPreferences(likedTags, excludedTags, comboTags) {
  try {
    // Build the query dynamically based on preferences
    let query = `
      WITH
      -- Get all tags for each story
      story_tags_list AS (
        SELECT
          s.id as story_id,
          ARRAY_AGG(t.slug) as tag_slugs
        FROM stories s
        LEFT JOIN story_tags st ON s.id = st.story_id
        LEFT JOIN tags t ON st.tag_id = t.id
        WHERE s.deleted_at IS NULL
        GROUP BY s.id
      ),
      -- Calculate matches
      story_matches AS (
        SELECT
          s.id,
          s.title,
          s.slug,
          s.summary,
          s.published_at,
          ap.pen_name as author_name,
          stl.tag_slugs,
          COALESCE(vfc.followers, 0) as follower_count,
          -- Count how many liked tags match
          (
            SELECT COUNT(*)
            FROM UNNEST($1::text[]) AS liked_tag
            WHERE liked_tag = ANY(stl.tag_slugs)
          ) as liked_match_count,
          -- Count how many excluded tags are present
          (
            SELECT COUNT(*)
            FROM UNNEST($2::text[]) AS excluded_tag
            WHERE excluded_tag = ANY(stl.tag_slugs)
          ) as excluded_match_count
        FROM stories s
        LEFT JOIN author_profiles ap ON s.author_profile_id = ap.id
        LEFT JOIN story_tags_list stl ON s.id = stl.story_id
        LEFT JOIN v_story_follow_counts vfc ON s.id = vfc.story_id
        WHERE s.deleted_at IS NULL
      )
      SELECT
        id,
        title,
        slug,
        summary,
        author_name,
        liked_match_count as tag_match_count,
        follower_count
      FROM story_matches
      WHERE liked_match_count > 0  -- Must have at least one liked tag
        AND excluded_match_count = 0  -- Must not have any excluded tags
    `;

    // Add combo tag filtering if combos exist
    if (comboTags && comboTags.length > 0) {
      // For each combo, story must have BOTH tags, or match via regular liked tags
      const comboConditions = comboTags.map((combo, idx) =>
        `($${3 + idx * 2}::text = ANY(tag_slugs) AND $${4 + idx * 2}::text = ANY(tag_slugs))`
      ).join(' OR ');

      query += `
        AND (
          liked_match_count > 0  -- Matches via regular liked tags
          ${comboTags.length > 0 ? `OR (${comboConditions})` : ''}
        )
      `;
    }

    query += `
      ORDER BY liked_match_count DESC, follower_count DESC, published_at DESC
      LIMIT 20
    `;

    // Build parameters array
    const params = [likedTags, excludedTags];

    // Add combo tag parameters
    comboTags.forEach(combo => {
      params.push(combo.tag1, combo.tag2);
    });

    const stories = await sql(query, params);
    return stories;
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    throw error;
  }
}

// Keep old function for backwards compatibility
export async function getRecommendationsByTags(tagSlugs) {
  return getRecommendationsByPreferences(tagSlugs, [], []);
}
