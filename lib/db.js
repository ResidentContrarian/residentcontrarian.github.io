import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL);

export async function getAllTags() {
  try {
    const tags = await sql`
      SELECT id, slug, name, tag_type, categories, is_master_switch, display_order
      FROM tags
      ORDER BY display_order ASC, name ASC
    `;
    return tags;
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
}

export async function getRecommendationsByPreferences(selectedTags, excludedTags) {
  try {
    // Expand master switches to include all related tags
    // For example, if "all-fantasy" is selected, include all tags with 'fantasy' in their categories
    const query = `
      WITH
      -- Expand selected tags: if a master switch is selected, include all related tags
      expanded_selected AS (
        SELECT DISTINCT t.slug
        FROM tags t
        WHERE
          -- Include tags that are directly selected
          t.slug = ANY($1::text[])
          -- OR include tags whose category has a master switch selected
          OR EXISTS (
            SELECT 1
            FROM tags master
            WHERE master.slug = ANY($1::text[])
              AND master.is_master_switch = true
              AND master.categories && t.categories  -- Categories overlap
          )
      ),
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
          -- Count how many selected tags match (using expanded list)
          (
            SELECT COUNT(*)
            FROM expanded_selected es
            WHERE es.slug = ANY(stl.tag_slugs)
          ) as selected_match_count,
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
        selected_match_count as tag_match_count,
        follower_count
      FROM story_matches
      WHERE selected_match_count > 0  -- Must have at least one selected tag
        AND excluded_match_count = 0  -- Must not have any excluded tags (HARD BOUNDARY)
      ORDER BY selected_match_count DESC, follower_count DESC, published_at DESC
      LIMIT 20
    `;

    const stories = await sql(query, [selectedTags, excludedTags || []]);
    return stories;
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    throw error;
  }
}

// Keep old function for backwards compatibility
export async function getRecommendationsByTags(tagSlugs) {
  return getRecommendationsByPreferences(tagSlugs, []);
}
