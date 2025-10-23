import { Pool } from "pg";

export default async function handler(req, res) {
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    const result = await pool.query("SELECT NOW()");
    res.status(200).json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.stack });
  }
}
