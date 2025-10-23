// app/api/stories/route.js
import { sql, parseCSV } from '@/lib/db';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // --- Pagination & search ---
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
    const offset = (page - 1) * limit;
    const q = (searchParams.get('q') || '').trim();

    // --- Tag filters ---
    // include=cozy,fantasy   (which tags to include)
    // include_mode=all|any   (require all include tags? default = any)
    // exclude=horror,grimdark
    const includeTags = parseCSV(searchParams.get('include'));
    const includeMode = (searchParams.get('include_mode') || 'any').toLowerCase() === 'all' ? 'all' : 'any';
    const excludeTags = parseCSV(searchParams.get('exclude'));

    // We’ll assemble a single SQL with optional WHERE/HAVING pieces.
    // Use dynamic fragments only when you actually have include/exclude tags.
    const whereParts = [
      sql`s.deleted_at IS NULL`,
      sql`s.status = 'published'::status_enum`
    ];
    const havingParts = [];
    const params = [];

    // Text search on title (simple ILIKE)
    if (q) {
      whereParts.push(sql`s.title ILIKE ${'%' + q + '%'}`);
    }

    // Include tags:
    //  - ANY: require at least 1 of the provided tags to appear on the story
    //  - ALL: require ALL provided tags to appear on the story
    //
    // We implement this with HAVING and COUNT DISTINCT over joined tags.
    if (includeTags.length > 0) {
      const includeList = sql.join(includeTags.map(t => sql`${t}`), sql`, `);
      if (includeMode === 'all') {
        havingParts.push(sql`
          COUNT(DISTINCT CASE WHEN t.slug IN (${includeList}) THEN t.slug END) = ${includeTags.length}
        `);
      } else {
        // any
        havingParts.push(sql`
          COUNT(DISTINCT CASE WHEN t.slug IN (${includeList}) THEN t.slug END) >= 1
        `);
      }
    }

    // Exclude tags: story must have ZERO of these tags
    if (excludeTags.length > 0) {
      const excludeList = sql.join(excludeTags.map(t => sql`${t}`), sql`, `);
      havingParts.push(sql`
        COUNT(DISTINCT CASE WHEN t.slug IN (${excludeList}) THEN t.slug END) = 0
      `);
    }

    // Base query: aggregate tags & author info
    const base = sql`
      FROM stories s
      JOIN author_profiles ap ON ap.id = s.author_profile_id
      LEFT JOIN story_tags st ON st.story_id = s.id
      LEFT JOIN tags t ON t.id = st.tag_id
      WHERE ${sql.join(whereParts, sql` AND `)}
      GROUP BY s.id, ap.pen_name
      ${havingParts.length ? sql`HAVING ${sql.join(havingParts, sql` AND `)}` : sql``}
    `;

    // Total count (for pagination UI)
    const totalRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT s.id
        ${base}
      ) AS x
    `;
    const total = totalRows[0]?.total || 0;

    // Page of results
    const rows = await sql`
      SELECT
        s.id,
        s.title,
        s.slug,
        s.summary,
        s.published_at,
        ap.pen_name AS author,
        COALESCE(array_agg(DISTINCT t.slug) FILTER (WHERE t.slug IS NOT NULL), '{}') AS tags
      ${base}
      ORDER BY s.published_at DESC NULLS LAST, s.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return new Response(
      JSON.stringify({
        ok: true,
        page,
        limit,
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
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
