// lib/db.js
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true; // reuse connections across invocations on Vercel
export const sql = neon(process.env.NEON_DATABASE_URL);

/**
 * Optional: look up a user by username (no inserts/creates).
 * Returns null if not found.
 */
export async function findUserByUsername(username) {
  if (!username) return null;
  const rows = await sql(
    `select id, username, display_name
       from users
      where lower(username) = lower($1)
      limit 1`,
    [username]
  );
  return rows[0] || null;
}

/**
 * Get story recommendations by provided tag slugs/names.
 * - Matches tags by slug OR name (case-insensitive)
 * - Ranks by tag matches DESC, followers DESC, recency DESC
 * - Falls back to top-by-followers if no matching tags
 */
export async function getRecommendationsByTags({ tagSlugsOrNames = [], limit = 12 }) {
  const tags = (tagSlugsOrNames || [])
    .map(t => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  // Resolve tag UUIDs from either slug or name
  let tagIds = [];
  if (tags.length) {
    const rows = await sql(
      `select id
         from tags
        where lower(slug) = any($1) or lower(name) = any($1)`,
      [tags]
    );
