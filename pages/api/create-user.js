import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { username, likedTagIds } = req.body || {};
    if (!username || !Array.isArray(likedTagIds) || likedTagIds.length === 0) {
      return res.status(400).json({ error: "username and likedTagIds[] required" });
    }

    // upsert user
    const u = await pool.query(
      `INSERT INTO users (username) VALUES ($1)
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
       RETURNING id`,
      [username.trim()]
    );
    const userId = u.rows[0].id;

    // reset likes then add
    await pool.query(`DELETE FROM user_tag_likes WHERE user_id = $1`, [userId]);
    const vals = likedTagIds.map((id, i) => `($1, $${i+2})`).join(", ");
    await pool.query(
      `INSERT INTO user_tag_likes (user_id, tag_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
      [userId, ...likedTagIds]
    );

    res.status(201).json({ ok: true, userId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
