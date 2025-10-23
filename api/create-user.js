// api/create-user.js  (root-level "api" folder, not pages/)
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, likedTagIds } = req.body || {};
    const u = (username || '').trim();
    if (!u) return res.status(400).json({ error: 'Username required' });

    // If you want DB writes later, do them here.
    // For now we just return where to go next:
    return res.status(200).json({ ok: true, redirect: `/u/${encodeURIComponent(u)}` });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
