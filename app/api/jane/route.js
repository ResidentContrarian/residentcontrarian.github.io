// app/api/jane/route.js
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql, findUserByUsername, getRecommendationsByTags } from '../../../lib/db';

function parseList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(parseList);
  return String(raw)
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

async function handle(payload) {
  const name = (payload.name || payload.username || '').trim();
  const tags = parseList(payload.tags);

  // Try to resolve a user
  const user = name ? await findUserByUsername(name) : null;

  // Recommendations
  const recs = await getRecommendationsByTags({ tagSlugsOrNames: tags, limit: 12 });

  // Echo back resolved tags
  let resolvedTags = [];
  if (tags.length) {
    const rows = await sql/*sql*/`
      select name, slug
      from tags
      where lower(slug) = any(${sql.array(tags, 'text')})
         or lower(name) = any(${sql.array(tags, 'text')})
      order by slug nulls last, name
    `;
    resolvedTags = rows.map(r => r.slug || r.name);
  }

  return NextResponse.json({
    ok: true,
    user: user ? { id: user.id, username: user.username, display_name: user.display_name } : null,
    tags: resolvedTags,
    recommendations: recs
  });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name') || searchParams.get('username') || '';
  const tags = searchParams.getAll('tags').length
    ? searchParams.getAll('tags')
    : searchParams.get('tags') || '';
  return handle({ name, tags });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return handle(body || {});
}
