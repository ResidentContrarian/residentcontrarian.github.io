import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const { username } = req.body || {};
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ ok: false, error: 'username required' });
    }
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-_]{1,30}$/.test(uname)) {
      return res.status(400).json({ ok: false, error: 'invalid username' });
    }

    // Upsert-style: try insert; on conflict, return existing
    const rows = await sql`
      INSERT INTO users (email, display_name, username, is_author)
      VALUES (${uname + '@local.local'}, ${uname}, ${uname}, false)
      ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id, username, display_name;
    `;
    res.status(200).json({ ok: true, user: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
