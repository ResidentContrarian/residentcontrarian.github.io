import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (req.method !== 'PUT') {
      res.setHeader('Allow', ['PUT']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const { username } = req.query;
    const uname = String(username || '').toLowerCase();
    const { include_slugs } = req.body || {};
    const slugs = Array.isArray(include_slugs) ? include_slugs.map(s => String(s).toLowerCase().trim()).filter(Boolean) : [];

    if (!uname) return res.status(400).json({ ok: false, error: 'username required' });
    if (slugs.length === 0) return res.status(400).json({ ok: false, error: 'include_slugs required' });

    // Find user
    const userRows = await sql`SELECT id FROM users WHERE lower(username) = ${uname} AND deleted_at IS NULL LIMIT 1;`;
    const user = userRows[0];
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });

    // Resolve tag ids
    const tagRows = await sql`SELECT id, slug FROM tags WHERE slug = ANY(${slugs}::text[]);`;
    const tagIds = tagRows.map(t => t.id);
    if (tagIds.length === 0) return res.status(400).json({ ok: false, error: 'no valid tags' });

    // Overwrite existing INCLUDE prefs in one transaction:
    await sql.begin(async tx => {
      await tx`DELETE FROM user_tag_preferences WHERE user_id = ${user.id} AND mode = 'include'::preference_mode_enum;`;
      for (const tid of tagIds) {
        await tx`
          INSERT INTO user_tag_preferences (user_id, tag_id, mode, weight)
          VALUES (${user.id}, ${tid}, 'include'::preference_mode_enum, 1)
          ON CONFLICT (user_id, tag_id, mode) DO NOTHING;
        `;
      }
    });

    res.status(200).json({ ok: true, saved: tagRows.map(t => t.slug) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
