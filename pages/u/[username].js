import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

export async function getServerSideProps(ctx) {
  const username = ctx.params.username;

  // load user + their liked tags
  const u = await pool.query(`SELECT id, username FROM users WHERE username = $1`, [username]);
  if (!u.rowCount) {
    return { notFound: true };
  }
  const user = u.rows[0];

  const liked = await pool.query(
    `SELECT tag_id FROM user_tag_likes WHERE user_id = $1`,
    [user.id]
  );
  const tagIds = liked.rows.map(r => r.tag_id);

  // authors that have ANY of the liked tags
  let authors = [];
  if (tagIds.length) {
    const q = await pool.query(
      `SELECT a.id, a.name, a.url
         FROM authors a
         JOIN author_tags at ON at.author_id = a.id
        WHERE at.tag_id = ANY($1::int[])
        GROUP BY a.id, a.name, a.url
        ORDER BY a.name`,
      [tagIds]
    );
    authors = q.rows;
  }

  return { props: { username, authors } };
}

export default function UserPage({ username, authors }) {
  return (
    <main style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 24 }}>
      <h1>Hello {username}</h1>
      <h3>Matching authors</h3>
      {authors.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <ul>
          {authors.map(a => (
            <li key={a.id}><a href={a.url}>{a.name}</a></li>
          ))}
        </ul>
      )}
    </main>
  );
}
