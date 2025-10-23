// pages/api/test-db.js  (ESM for Next.js 14)
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    const r = await pool.query("SELECT NOW()");
    res.status(200).json({ ok: true, time: r.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
