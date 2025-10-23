// pages/api/stories/[slug].js
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const { slug } = req.query;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing slug' });
    }

    // Fetch 1 published, non-deleted story by slug (case-insensitive),
    // include author pen_name and an array of tag slugs.
    const rows = await sql`
      SELECT
        s.id,
        s.title,
        s.slug,
        s.summary,
        s.status,
        s.visibility,
        s.published_at,
        s.created_at,
        s.updated_at,
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
      FROM stories s
      JOIN author_profiles ap ON ap.id = s.author_profile_id
      WHERE s.deleted_at IS NULL
        AND s.status = 'published'::status_enum
        AND lower(s.slug) = ${slug.toLowerCase()}
      LIMIT 1;
    `;

    const story = rows[0];
    if (!story) {
      return res.status(404).json({ ok: false, error: 'Story not found' });
    }

    return res.status(200).json({
      ok: true,
      item: {
        id: story.id,
        title: story.title,
        slug: story.slug,
        summary: story.summary,
        status: story.status,
        visibility: story.visibility,
        author: story.author,
        published_at: story.published_at,
        created_at: story.created_at,
        updated_at: story.updated_at,
        tags: story.tags
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
