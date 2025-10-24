import { Clerk } from '@clerk/clerk-sdk-node';
import { neon } from '@neondatabase/serverless';

const clerk = Clerk({ secretKey: process.env.CLERK_SECRET_KEY });
const sql = neon(process.env.NEON_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    // Get user from Clerk session
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await clerk.sessions.getSession(sessionId);
    const userId = session.userId;

    // Load liked tags
    const likedTagsResult = await sql`
      SELECT t.slug
      FROM user_liked_tags ult
      JOIN tags t ON ult.tag_id = t.id
      WHERE ult.user_id = ${userId}
    `;
    const likedTags = likedTagsResult.map(row => row.slug);

    // Load excluded tags
    const excludedTagsResult = await sql`
      SELECT t.slug
      FROM user_excluded_tags uet
      JOIN tags t ON uet.tag_id = t.id
      WHERE uet.user_id = ${userId}
    `;
    const excludedTags = excludedTagsResult.map(row => row.slug);

    // Load combo tags
    const comboTagsResult = await sql`
      SELECT t1.slug as tag1, t2.slug as tag2
      FROM user_combo_tags uct
      JOIN tags t1 ON uct.tag1_id = t1.id
      JOIN tags t2 ON uct.tag2_id = t2.id
      WHERE uct.user_id = ${userId}
    `;
    const comboTags = comboTagsResult.map(row => ({ tag1: row.tag1, tag2: row.tag2 }));

    res.status(200).json({
      likedTags,
      excludedTags,
      comboTags
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to load preferences', details: error.message });
  }
}
