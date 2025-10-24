// app/api/jane/route.js
export const runtime = 'nodejs'; // safer for Neon; switch to 'edge' later if you want

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
  const name = (payload.name || payload.username || '').trim(); // from form "name" field
  const tags = parseList(payload.tags);

  // Try to look up the user by username; if not found, that's fine (we'll still do tag-only recs)
  const user = name ? await findUserByUsername(name) : null;

  // Recommend by supplied tags; if none, fallback to top-by-followers
  const recs = await getRecommendationsByTags({ tagSlugsOrNames: tags, limit: 12 });

  // Echo back the tags we actually matched (by resolving to rows)
  let resolvedTags = [];
  if (tags.length) {
    const rows = await sql(
      `select name, slug
         from tags
        where lower(slug) = any($1) or lower(name) = any($1)
        order by slug nulls last, name`,
      [tags]
    );
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
