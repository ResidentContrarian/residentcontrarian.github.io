import { pool } from "../_db.js";
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).end();
  const { username } = req.query;
  const { rows } = await pool.query(`
WITH me AS (SELECT id AS user_id FROM users WHERE username=$1),
simple_ids AS (
  SELECT t.id FROM user_tags_simple uts
  JOIN tags t ON t.id=uts.tag_id JOIN me m ON m.user_id=uts.user_id),
excluded_ids AS (
  SELECT t.id FROM user_tags_excluded uxe
  JOIN tags t ON t.id=uxe.tag_id JOIN me m ON m.user_id=uxe.user_id),
simple_matches AS (
  SELECT DISTINCT a.id FROM authors a
  JOIN author_tags at ON at.author_id=a.id
  WHERE at.tag_id IN (SELECT id FROM simple_ids)),
authors_with_excluded AS (
  SELECT DISTINCT a.id FROM authors a
  JOIN author_tags at ON at.author_id=a.id
  WHERE at.tag_id IN (SELECT id FROM excluded_ids)),
simple_minus_excluded AS (
  SELECT id FROM simple_matches
  EXCEPT SELECT id FROM authors_with_excluded),
combined_matches AS (
  SELECT a.id FROM user_tags_combined utc
  JOIN me m ON m.user_id=utc.user_id
  JOIN authors a ON TRUE
  JOIN author_tags at ON at.author_id=a.id
  WHERE at.tag_id = ANY (utc.tag_ids)
  GROUP BY a.id, utc.id, utc.tag_ids
  HAVING COUNT(DISTINCT at.tag_id)=cardinality(utc.tag_ids)),
final_ids AS (
  SELECT id FROM combined_matches
  UNION SELECT id FROM simple_minus_excluded)
SELECT a.name, a.url FROM authors a
WHERE a.id IN (SELECT id FROM final_ids) ORDER BY a.name
  `, [username]);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ username, authors: rows });
}
