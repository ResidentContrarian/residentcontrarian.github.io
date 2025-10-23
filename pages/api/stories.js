// pages/api/stories.js
import { neon } from '@neondatabase/serverless';

// Use the same DATABASE_URL you used for db-test
const sql = neon(process.env.DATABASE_URL);

// tiny helper for comma lists
function parseCSV(value) {
  if (!value) return [];
  return value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const { q = '', page = '1', limit = '20', include = '', include_mode = 'any', exclude = '' } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offset = (pageNum - 1) * lim;

    const includeTags = parseCSV(include);
    const excludeTags = parseCSV(exclude);
    const includeMode = String(include_mode).toLowerCase() === 'all' ? 'all' : 'any';
    const qTerm = (q || '').trim();

    // Build filters with simple subqueries (no fancy helpers)
    // include (any/all) and exclude are handled with EXISTS/COUNT subselects
    const totalRows = await sql`
      WITH filtered AS (
        SELECT s.id
        FROM stories s
        WHERE s.deleted_at IS NULL
          AND s.status = 'published'::status_enum
          AND (${qTerm === ''} OR s.title ILIKE ${'%' + qTerm + '%'})
          AND (${includeTags.length === 0} OR (
                ${includeMode === 'all'}
                AND (
                  SELECT COUNT(DISTINCT t.slug)
                  FROM story_tags st
                  JOIN tags t ON t.id = st.tag_id
                  WHERE st.story_id = s.id
                    AND t.slug = ANY(${includeTags}::text[])
                ) = array_length(${includeTags}::text[], 1)
              ) OR (
                ${includeMode === 'any'}
                AND EXISTS (
                  SELECT 1
                  FROM story_tags st
                  JOIN tags t ON t.id = st.tag_id
                  WHERE st.story_id = s.id
                    AND t.slug = ANY(${includeTags}::text[])
                )
              ))
          AND (${excludeTags.length === 0} OR NOT EXISTS (
                SELECT 1
                FROM story_tags st
                JOIN tags t ON t.id = st.tag_id
                WHERE st.story_id = s.id
                  AND t.slug = ANY(${excludeTags}::text[])
              ))
      )
      SELECT COUNT(*)::int AS total FROM filtered;
    `;

    const total = totalRows[0]?.total || 0;

    const rows = await sql`
      WITH filtered AS (
        SELECT s.*
        FROM stories s
        WHERE s.deleted_at IS NULL
          AND s.status = 'published'::status_enum
          AND (${qTerm === ''} OR s.title ILIKE ${'%' + qTerm + '%'})
          AND (${includeTags.length === 0} OR (
                ${includeMode === 'all'}
                AND (
                  SELECT COUNT(DISTINCT t.slug)
                  FROM story_tags st
                  JOIN tags t ON t.id = st.tag_id
                  WHERE st.story_id = s.id
                    AND t.slug = ANY(${includeTags}::text[])
                ) = array_length(${includeTags}::text[], 1)
              ) OR (
                ${includeMode === 'any'}
                AND EXISTS (
                  SELECT 1
                  FROM story_tags st
                  JOIN tags t ON t.id = st.tag_id
                  WHERE st.story_id = s.id
                    AND t.slug = ANY(${includeTags}::text[])
                )
              ))
          AND (${excludeTags.length === 0} OR NOT EXISTS (
                SELECT 1
                FROM story_tags st
                JOIN tags t ON t.id = st.tag_id
                WHERE st.story_id = s.id
                  AND t.slug = ANY(${excludeTags}::text[])
              ))
      )
      SELECT
        s.id,
        s.title,
        s.slug,
        s.summary,
        s.published_at,
        ap.pen_name AS author,
        COALESCE(
          ARRAY(
            SELECT DISTINCT t.slug
            FROM story_tags st
            JOIN tags t ON t.id = st.tag_id
            WHERE st.story_id = s.id
            ORDER BY t.slug
          ),
          '{}'
        ) AS tags
      FROM filtered s
      JOIN author_profiles ap ON ap.id = s.author_profile_id
      ORDER BY s.published_at DESC NULLS LAST, s.created_at DESC
      LIMIT ${lim} OFFSET ${offset};
    `;

    return res.status(200).json({
      ok: true,
      page: pageNum,
      limit: lim,
      total,
      items: rows.map(r => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        summary: r.summary,
        author: r.author,
        published_at: r.published_at,
        tags: r.tags
      }))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
