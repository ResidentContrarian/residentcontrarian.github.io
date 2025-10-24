// lib/db.js
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true;
export const sql = neon(process.env.NEON_DATABASE_URL);

/**
 * Look up a user by username (no inserts).
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
    tagIds = r
