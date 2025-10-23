// pages/api/users/index.js
import { neon } from '@neondatabase/serverless';

let _sql = null;
function getSql() {
  const url = process.env.DATABASE_URL;
  if (!_sql) {
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

export default async function handler(req, res) {
  try {
    // Health probe for quick testing
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        probe: 'users route alive',
        hasDb: Boolean(process.env.DATABASE_URL)
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const uname = String(req.body?.username || '').trim().toLowerCase();
    if (!uname) return res.status(400).json({ ok: false, error: 'username required' });

    const sql = getSql();

    const rows = await sql`
      INSERT INTO users (email, display_name, username, is_author)
      VALUES (${uname + '@local.local'}, ${uname}, ${uname}, false)
      ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id, username, display_name;
    `;

    return res.status(200).json({ ok: true, user: rows[0] });
  } catch (e) {
    console.error('users API error:', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
