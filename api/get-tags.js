import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

export default async function handler(req, res) {
  try {
    const q = await pool.query("SELECT id, name FROM tags ORDER BY name");
    res.status(200).json(q.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
