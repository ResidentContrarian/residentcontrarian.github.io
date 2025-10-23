import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const uname = String(req.body?.username || '').trim().toLowerCase();
    if (!uname) return res.status(400).json({ ok: false, error: 'username required' });

    // Very simple insert/upsert
    const rows = await sql`
      INSERT INTO users (email, display_name, username, is_author)
      VALUES (${uname + '@local.local'}, ${uname}, ${uname}, false)
      ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id, email, username, display_name;
    `;

    return res.status(200).json({ ok: true, user: rows[0] });
  } catch (e) {
    console.error('users API error:', e); // shows in Vercel logs
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
