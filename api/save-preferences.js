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

    const { likedTags, excludedTags, comboTags } = req.body;

    if (!Array.isArray(likedTags)) {
      return res.status(400).json({ error: 'likedTags must be an array' });
    }

    // Start a transaction
    // First, clear existing preferences
    await sql`DELETE FROM user_liked_tags WHERE user_id = ${userId}`;
    await sql`DELETE FROM user_excluded_tags WHERE user_id = ${userId}`;
    await sql`DELETE FROM user_combo_tags WHERE user_id = ${userId}`;

    // Insert liked tags
    if (likedTags.length > 0) {
      for (const tagSlug of likedTags) {
        const tag = await sql`SELECT id FROM tags WHERE slug = ${tagSlug}`;
        if (tag.length > 0) {
          await sql`
            INSERT INTO user_liked_tags (user_id, tag_id)
            VALUES (${userId}, ${tag[0].id})
          `;
        }
      }
    }

    // Insert excluded tags
    if (excludedTags && excludedTags.length > 0) {
      for (const tagSlug of excludedTags) {
        const tag = await sql`SELECT id FROM tags WHERE slug = ${tagSlug}`;
        if (tag.length > 0) {
          await sql`
            INSERT INTO user_excluded_tags (user_id, tag_id)
            VALUES (${userId}, ${tag[0].id})
          `;
        }
      }
    }

    // Insert combo tags
    if (comboTags && comboTags.length > 0) {
      for (const combo of comboTags) {
        const tag1 = await sql`SELECT id FROM tags WHERE slug = ${combo.tag1}`;
        const tag2 = await sql`SELECT id FROM tags WHERE slug = ${combo.tag2}`;
        if (tag1.length > 0 && tag2.length > 0) {
          await sql`
            INSERT INTO user_combo_tags (user_id, tag1_id, tag2_id)
            VALUES (${userId}, ${tag1[0].id}, ${tag2[0].id})
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
