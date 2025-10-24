import { getRecommendationsByPreferences } from '../lib/db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  try {
    const likedParam = req.query.liked;
    const excludedParam = req.query.excluded;
    const combosParam = req.query.combos;

    if (!likedParam) {
      return res.status(400).json({ error: 'Liked tags parameter required' });
    }

    const likedTags = likedParam.split(',').filter(Boolean);
    const excludedTags = excludedParam ? excludedParam.split(',').filter(Boolean) : [];
    const comboTags = combosParam ? JSON.parse(combosParam) : [];

    const recommendations = await getRecommendationsByPreferences(likedTags, excludedTags, comboTags);

    res.status(200).json(recommendations);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message });
  }
}
