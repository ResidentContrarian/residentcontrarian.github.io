import { getRecommendationsByPreferences } from '../lib/db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  try {
    const selectedParam = req.query.selected || req.query.liked; // Support both new and old
    const excludedParam = req.query.excluded;
    const excludedContentParam = req.query.excludedContent;

    if (!selectedParam) {
      return res.status(400).json({ error: 'Selected tags parameter required' });
    }

    const selectedTags = selectedParam.split(',').filter(Boolean);
    const excludedTags = excludedParam ? excludedParam.split(',').filter(Boolean) : [];
    const excludedContent = excludedContentParam ? excludedContentParam.split(',').filter(Boolean) : [];

    // Combine all exclusions
    const allExclusions = [...excludedTags, ...excludedContent];

    const recommendations = await getRecommendationsByPreferences(selectedTags, allExclusions);

    res.status(200).json(recommendations);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message });
  }
}
