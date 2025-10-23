import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    await sql`CREATE TABLE IF NOT EXISTS notes (id serial PRIMARY KEY, msg text NOT NULL);`;
    const inserted = await sql`INSERT INTO notes (msg) VALUES ('hello from neon') RETURNING *;`;
    const recent = await sql`SELECT * FROM notes ORDER BY id DESC LIMIT 5;`;
    res.status(200).json({ ok: true, inserted: inserted[0], recent });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
