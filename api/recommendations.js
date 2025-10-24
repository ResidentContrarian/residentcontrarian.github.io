import { getRecommendationsByTags } from '../lib/db.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const tagsParam = url.searchParams.get('tags');

    if (!tagsParam) {
      return new Response(JSON.stringify({ error: 'Tags parameter required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const tagSlugs = tagsParam.split(',');
    const recommendations = await getRecommendationsByTags(tagSlugs);

    return new Response(JSON.stringify(recommendations), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch recommendations' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
