import { sql } from '../../lib/db';

export default async function handler(req, res) {
  try {
    await sql`CREATE TABLE IF NOT EXISTS notes (id serial PRIMARY KEY, msg text NOT NULL, created_at timestamptz DEFAULT now());`;

    if (req.method === 'POST') {
      const { msg } = req.body || {};
      if (!msg) return res.status(400).json({ ok:false, error:'msg required' });
      const rows = await sql`INSERT INTO notes (msg) VALUES (${msg}) RETURNING *;`;
      return res.status(201).json({ ok:true, note: rows[0] });
    }

    // GET
    const rows = await sql`SELECT * FROM notes ORDER BY id DESC LIMIT 20;`;
    return res.status(200).json({ ok:true, notes: rows });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
}
