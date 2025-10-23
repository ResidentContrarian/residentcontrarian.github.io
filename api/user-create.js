export const config = { runtime: "nodejs" };
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    const uname = String(req.body?.username || "").trim().toLowerCase();
    if (!uname) return res.status(400).json({ ok: false, error: "username required" });

    const sql = neon(process.env.DATABASE_URL);

    // find or create
    const existing = await sql`
      SELECT id, username, display_name FROM users WHERE lower(username) = ${uname} LIMIT 1;
    `;
    const user = existing.length
      ? (await sql`
          UPDATE users SET display_name = ${uname}, updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING id, email, username, display_name;
        `)[0]
      : (await sql`
          INSERT INTO users (email, display_name, username, is_author)
          VALUES (${uname + "@local.local"}, ${uname}, ${uname}, false)
          RETURNING id, email, username, display_name;
        `)[0];

    return res.status(200).json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
