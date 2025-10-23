import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const rows = await sql`SELECT name, slug FROM tags ORDER BY name ASC;`;
    res.status(200).json({ ok: true, items: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
