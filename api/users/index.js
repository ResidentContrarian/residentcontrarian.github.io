// Force Node runtime (not edge)
export const config = { runtime: 'nodejs' };

import { neon } from '@neondatabase/serverless';

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, probe: 'users route alive', hasDb: !!process.env.DATABASE_URL });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const uname = String(req.body?.username || '').trim().toLowerCase();
    if (!uname) return res.status(400).json({ ok: false, error: 'username required' });

    const sql = getSql();

    // 1) Try to find existing
    const existing = await sql`
      SELECT id, username, display_name
      FROM users
      WHERE lower(username) = ${uname}
      LIMIT 1;
    `;

    let row;
    if (existing.length) {
      // 2a) Update display_name, return
      row = (await sql`
        UPDATE users
        SET display_name = ${uname}, updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, email, username, display_name;
      `)[0];
    } else {
      // 2b) Insert fresh
      row = (await sql`
        INSERT INTO users (email, display_name, username, is_author)
        VALUES (${uname + '@local.local'}, ${uname}, ${uname}, false)
        RETURNING id, email, username, display_name;
      `)[0];
    }

    return res.status(200).json({ ok: true, user: row });
  } catch (e) {
    // Return the actual error string so we can see what's wrong
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
