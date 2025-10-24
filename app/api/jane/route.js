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

  const user = name ? await findUserByUsername(name) : null;

  // Recs
  const recs = await getRecommendationsByTags({ tagSlugsOrNames: tags, limit: 12 });

  // Echo back the resolved tag slugs/names (no ANY; use join-on-unnest)
  let resolvedTags = [];
  if (tags.length) {
    const rows = await sql/*sql*/`
      with q as (
        select unnest(${sql.array(tags, 'text')}) as q
      )
      select distinct coalesce(t.slug, t.name) as tag
      from tags t
      join q on lower(t.slug) = q.q or lower(t.name) = q.q
      order by tag
    `;
    resolvedTags = rows.map(r => r.tag);
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
