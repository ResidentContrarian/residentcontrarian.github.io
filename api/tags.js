import { pool } from "./_db.js";
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).end();
  try {
    const { rows } = await pool.query("SELECT name FROM tags ORDER BY name");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(rows.map(r => r.name));
  } catch (e) { res.status(500).json({ error: "server_error" }); }
}
