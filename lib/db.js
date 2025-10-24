// lib/db.js
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true; // reuse connections on Vercel
export const sql = neon(process.env.NEON_DATABASE_URL);

/**
 * Look up a user by username (no inserts).
 * Returns null if not found.
 */
export async function findUserByUsername(username) {
  if (!username) return null;
  const rows = await sql/*sql*/`
    select id, username, display_name
    from users
    where lower(username) = lower(${username})
    limit 1
  `;
  return rows[0] || null;
}

/**
 * Get story recommendations by provided tag slugs or names.
 * - Matches tags by slug OR name (case-insensitive)
 * - Ranks: tag matches DESC → followers DESC → recency DESC
 * - Fallback: top by followers if no tags match
 */
export async function getRecommendationsByTags({ tagSlugsOrNames = [], limit = 12 }) {
  const tags = (tagSlugsOrNames || [])
    .map(t => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  let tagIds = [];
  if (tags.length) {
    const rows = await sql/*sql*/`
      select id
      from tags
      where lower(slug) = any(${sql.array(tags, 'text')})
         or lower(name) = any(${sql.array(tags, 'text')})
    `;
    tagIds = rows.map(r => r.id);
  }

  if (tagIds.length) {
    return sql/*sql*/`
      with hits as (
        select
          s.id,
          s.title,
          s.slug,
          s.summary,
          s.published_at,
          s.created_at,
          ap.pen_name,
          coalesce(v.followers, 0) as followers,
          count(st.tag_id) as matches
        from stories s
        join story_tags st on st.story_id = s.id
        left join v_story_follow_counts v on v.story_id = s.id
        left join author_profiles ap on ap.id = s.author_profile_id
        where st.tag_id = any(${sql.array(tagIds, 'uuid')})
          and s.deleted_at is null
        group by s.id, ap.pen_name, v.followers
      )
      select *
      from hits
      order by matches desc,
               followers desc,
               coalesce(published_at, created_at) desc
      limit ${limit}
    `;
  }

  return sql/*sql*/`
    select
      s.id,
      s.title,
      s.slug,
      s.summary,
      s.published_at,
      s.created_at,
      ap.pen_name,
      coalesce(v.followers, 0) as followers,
      0 as matches
    from stories s
    left join v_story_follow_counts v on v.story_id = s.id
    left join author_profiles ap on ap.id = s.author_profile_id
    where s.deleted_at is null
    order by followers desc, coalesce(published_at, created_at) desc, title asc
    limit ${limit}
  `;
}
