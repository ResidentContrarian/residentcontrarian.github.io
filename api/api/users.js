import { pool } from "./_db.js";
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();
  const { username, email, tags_simple = [], tags_combined = [], tags_excluded = [] } = req.body || {};
  if (!username) return res.status(400).json({ error: "bad_username" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query(
      `INSERT INTO users (username, email)
       VALUES ($1,$2)
       ON CONFLICT (username) DO UPDATE SET email=EXCLUDED.email
       RETURNING id`,
      [username.trim(), email || null]
    );
    const userId = u.rows[0].id;

    // clear
    await client.query("DELETE FROM user_tags_simple WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_tags_excluded WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_tags_combined WHERE user_id=$1", [userId]);

    const nameToIds = async names => {
      if (!names?.length) return [];
      const r = await client.query("SELECT id FROM tags WHERE name = ANY($1::text[])", [names]);
      return r.rows.map(x => x.id);
    };

    const simpleIds = await nameToIds(tags_simple);
    if (simpleIds.length) {
      const vals = simpleIds.map((_, i) => `($1,$${i+2})`).join(",");
      await client.query(`INSERT INTO user_tags_simple (user_id,tag_id) VALUES ${vals} ON CONFLICT DO NOTHING`, [userId, ...simpleIds]);
    }
    const exclIds = await nameToIds(tags_excluded);
    if (exclIds.length) {
      const vals = exclIds.map((_, i) => `($1,$${i+2})`).join(",");
      await client.query(`INSERT INTO user_tags_excluded (user_id,tag_id) VALUES ${vals} ON CONFLICT DO NOTHING`, [userId, ...exclIds]);
    }
    for (const combo of tags_combined) {
      const ids = await nameToIds(combo);
      if (ids.length) await client.query(`INSERT INTO user_tags_combined (user_id, tag_ids) VALUES ($1,$2)`, [userId, ids]);
    }
    await client.query("COMMIT");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ ok: true, userId });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "server_error" });
  } finally { client.release(); }
}
