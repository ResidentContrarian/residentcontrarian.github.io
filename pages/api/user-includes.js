import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    const username = String(req.query.username || '').toLowerCase();
    if (!username) return res.status(400).json({ ok:false, error:'username required' });

    const rows = await sql`
      SELECT t.slug
      FROM users u
      JOIN user_tag_preferences p ON p.user_id = u.id AND p.mode = 'include'::preference_mode_enum
      JOIN tags t ON t.id = p.tag_id
      WHERE lower(u.username) = ${username}
      ORDER BY t.slug;
    `;
    res.status(200).json({ ok:true, items: rows.map(r => r.slug) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
}
