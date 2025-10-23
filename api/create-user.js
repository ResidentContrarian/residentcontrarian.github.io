// api/create-user.js  (root-level "api" folder, same as get-tags.js)
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, note: 'create-user is live' });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, likedTagIds } = req.body || {};
    const u = (username || '').trim();
    if (!u) return res.status(400).json({ error: 'Username required' });

    // (DB writes would go here later)
    return res.status(200).json({ ok: true, redirect: `/u/${encodeURIComponent(u)}` });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
