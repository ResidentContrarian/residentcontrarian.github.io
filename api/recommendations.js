import { getRecommendationsByTags } from '../lib/db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  try {
    const tagsParam = req.query.tags;

    if (!tagsParam) {
      return res.status(400).json({ error: 'Tags parameter required' });
    }

    const tagSlugs = tagsParam.split(',');
    const recommendations = await getRecommendationsByTags(tagSlugs);

    res.status(200).json(recommendations);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message });
  }
}
