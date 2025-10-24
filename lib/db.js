// lib/db.js
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true;
export const sql = neon(process.env.NEON_DATABASE_URL);

/** Optional: look up a user by username (no inserts). */
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
 * Recommend stories by provided tag slugs or names.
 * - Resolve tags via join on unnest(text[])
 * - Rank: tag matches DESC → followers DESC → recency DESC
 * - Fallback: top-by-followers if no tags match
 */
export async function getRecommendationsByTags({ tagSlugsOrNames = [], limit = 12 }) {
  const tags = (tagSlugsOrNames || [])
    .map(t => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  let tagIds = [];
  if (tags.length) {
    const rows = await sql/*sql*/`
      with q as (
        select unnest(${sql.array(tags, 'text')}) as q
      )
      select t.id
      from tags t
      join q on lower(t.slug) = q.q or lower(t.name) = q.q
    `;
    tagIds = rows.map(r => r.id);
  }

  if (tagIds.length) {
    return sql/*sql*/`
      with wanted as (
        select unnest(${sql.array(tagIds, 'uuid')}) as tag_id
      ),
      hits as (
        select
          s.id,
          s.title,
          s.slug,
          s.summary,
          s.published_at,
          s.created_at,
          ap.pen_name,
          coalesce(v.followers, 0) as followers,
          count(*) as matches
        from stories s
        join story_tags st on st.story_id = s.id
        join wanted w on w.tag_id = st.tag_id
        left join v_story_follow_counts v on v.story_id = s.id
        left join author_profiles ap on ap.id = s.author_profile_id
        where s.deleted_at is null
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

  // Fallback: no tags provided/resolved → top-by-followers
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
