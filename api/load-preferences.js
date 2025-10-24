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

    // Load selected tags (liked tags)
    const selectedTagsResult = await sql`
      SELECT t.slug
      FROM user_liked_tags ult
      JOIN tags t ON ult.tag_id = t.id
      WHERE ult.user_id = ${userId}
    `;
    const selectedTags = selectedTagsResult.map(row => row.slug);

    // Load excluded tags and separate by type
    const excludedTagsResult = await sql`
      SELECT t.slug, t.tag_type
      FROM user_excluded_tags uet
      JOIN tags t ON uet.tag_id = t.id
      WHERE uet.user_id = ${userId}
    `;

    const excludedTags = excludedTagsResult
      .filter(row => row.tag_type !== 'content_warning')
      .map(row => row.slug);

    const excludedContent = excludedTagsResult
      .filter(row => row.tag_type === 'content_warning')
      .map(row => row.slug);

    res.status(200).json({
      selectedTags,
      excludedTags,
      excludedContent
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to load preferences', details: error.message });
  }
}
