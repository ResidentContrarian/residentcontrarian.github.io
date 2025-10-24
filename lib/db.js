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

export async function getRecommendationsByTags(tagSlugs) {
  try {
    const stories = await sql`
      WITH tag_matches AS (
        SELECT
          s.id,
          s.title,
          s.slug,
          s.summary,
          s.published_at,
          ap.pen_name as author_name,
          COUNT(DISTINCT st.tag_id) as tag_match_count,
          COALESCE(vfc.followers, 0) as follower_count
        FROM stories s
        LEFT JOIN author_profiles ap ON s.author_profile_id = ap.id
        LEFT JOIN story_tags st ON s.id = st.story_id
        LEFT JOIN tags t ON st.tag_id = t.id
        LEFT JOIN v_story_follow_counts vfc ON s.id = vfc.story_id
        WHERE s.deleted_at IS NULL
          AND t.slug = ANY(${tagSlugs})
        GROUP BY s.id, s.title, s.slug, s.summary, s.published_at, ap.pen_name, vfc.followers
      )
      SELECT
        id,
        title,
        slug,
        summary,
        author_name,
        tag_match_count,
        follower_count
      FROM tag_matches
      ORDER BY tag_match_count DESC, follower_count DESC, published_at DESC
      LIMIT 20
    `;
    return stories;
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    throw error;
  }
}
