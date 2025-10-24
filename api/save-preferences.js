import { Clerk } from '@clerk/clerk-sdk-node';
import { neon } from '@neondatabase/serverless';

const clerk = Clerk({ secretKey: process.env.CLERK_SECRET_KEY });
const sql = neon(process.env.NEON_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

    const { selectedTags, excludedTags, excludedContent } = req.body;

    if (!Array.isArray(selectedTags)) {
      return res.status(400).json({ error: 'selectedTags must be an array' });
    }

    // First, clear existing preferences
    await sql`DELETE FROM user_liked_tags WHERE user_id = ${userId}`;
    await sql`DELETE FROM user_excluded_tags WHERE user_id = ${userId}`;

    // Insert selected tags (liked tags)
    if (selectedTags.length > 0) {
      for (const tagSlug of selectedTags) {
        const tag = await sql`SELECT id FROM tags WHERE slug = ${tagSlug}`;
        if (tag.length > 0) {
          await sql`
            INSERT INTO user_liked_tags (user_id, tag_id)
            VALUES (${userId}, ${tag[0].id})
          `;
        }
      }
    }

    // Insert excluded tags (both genre exclusions and content warnings)
    const allExclusions = [...(excludedTags || []), ...(excludedContent || [])];
    if (allExclusions.length > 0) {
      for (const tagSlug of allExclusions) {
        const tag = await sql`SELECT id FROM tags WHERE slug = ${tagSlug}`;
        if (tag.length > 0) {
          await sql`
            INSERT INTO user_excluded_tags (user_id, tag_id)
            VALUES (${userId}, ${tag[0].id})
          `;
        }
      }
    }

    res.status(200).json({ success: true, message: 'Preferences saved successfully' });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to save preferences', details: error.message });
  }
}
