import { getAllTags } from '../lib/db.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const tags = await getAllTags();

    return new Response(JSON.stringify(tags), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch tags' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
