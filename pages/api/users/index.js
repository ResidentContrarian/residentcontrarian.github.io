// pages/api/users/index.js
export const config = { runtime: 'nodejs' }; // ensure Node runtime, not edge

import { neon } from '@neondatabase/serverless';

let sql = null;
function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!sql) sql = neon(url);
  return sql;
}

export default async function handler(req, res) {
  try {
    // Health probe: should never 500
    if (req.method === 'GET') {
      return res
        .status(200)
        .json({ ok: true, probe: 'users route alive', hasDb: Boolean(process.env.DATABASE_URL) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const uname = String(req.body?.username || '').trim().toLowerCase();
    if (!uname) return res.status(400).json({ ok: false, error: 'username required' });

    const db = getSql();
    const rows = await db`
      INSERT INTO users (email, display_name, username, is_author)
      VALUES (${uname + '@local.local'}, ${uname}, ${uname}, false)
      ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id, email, username, display_name;
    `;

    return res.status(200).json({ ok: true, user: rows[0] });
  } catch (e) {
    console.error('users API error:', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
