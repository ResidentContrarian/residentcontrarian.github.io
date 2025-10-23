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

    // toggles & paging for chapters
    const includeChapters = String(req.query.include_chapters || '').toLowerCase() === 'true';
    const includeContent  = String(req.query.include_content  || '').toLowerCase() === 'true';
    const chPage  = Math.max(parseInt(req.query.chapters_page  || '1', 10) || 1, 1);
    const chLimit = Math.min(Math.max(parseInt(req.query.chapters_limit || '50', 10) || 50, 1), 100);
    const chOffset = (chPage - 1) * chLimit;

    // 1) fetch the story + author + tags
    const storyRows = await sql`
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

    const story = storyRows[0];
    if (!story) {
      return res.status(404).json({ ok: false, error: 'Story not found' });
    }

    // 2) optionally include chapters (published only, ordered)
    let chapters = [];
    let chaptersTotal = 0;

    if (includeChapters) {
      // total count for pagination
      const totalRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM chapters c
        WHERE c.story_id = ${story.id}
          AND c.deleted_at IS NULL
          AND c.status = 'published'::status_enum
      `;
      chaptersTotal = totalRows[0]?.total || 0;

      // page of chapters
      if (includeContent) {
        chapters = await sql`
          SELECT
            c.id,
            c.ordinal,
            c.title,
            c.slug,
            c.word_count,
            c.published_at,
            c.created_at,
            c.updated_at,
            c.content
          FROM chapters c
          WHERE c.story_id = ${story.id}
            AND c.deleted_at IS NULL
            AND c.status = 'published'::status_enum
          ORDER BY c.ordinal ASC
          LIMIT ${chLimit} OFFSET ${chOffset};
        `;
      } else {
        chapters = await sql`
          SELECT
            c.id,
            c.ordinal,
            c.title,
            c.slug,
            c.word_count,
            c.published_at,
            c.created_at,
            c.updated_at
          FROM chapters c
          WHERE c.story_id = ${story.id}
            AND c.deleted_at IS NULL
            AND c.status = 'published'::status_enum
          ORDER BY c.ordinal ASC
          LIMIT ${chLimit} OFFSET ${chOffset};
        `;
      }
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
      },
      chapters: includeChapters ? {
        page: chPage,
        limit: chLimit,
        total: chaptersTotal,
        items: chapters
      } : undefined
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
