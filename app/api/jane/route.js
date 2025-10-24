// app/api/jane/route.js
export const runtime = 'edge'; // Neon works great on the edge runtime

import { NextResponse } from 'next/server';
import { ensureSchema, upsertUserWithTags, getRecommendations, sql } from '@/lib/db';

function parseTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(parseTags);
  return String(raw)
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

async function handle(payload) {
  await ensureSchema();

  const name = (payload.name || '').trim();
  const tags = parseTags(payload.tags);

  if (!name) {
    return NextResponse.json({ ok: false, error: 'Missing "name"' }, { status: 400 });
  }

  const { user } = await upsertUserWithTags(name, tags);

  // Echo back the user’s saved tags as names for the UI
  const savedTags = await sql/*sql*/`
    select t.name
    from user_tags ut
    join tags t on t.id = ut.tag_id
    where ut.user_id = ${user.id}
    order by t.name asc;
  `;

  // Build tagId list for recommendation using either provided tags or saved ones
  let tagIds = [];
  if (tags.length) {
    const rows = await sql/*sql*/`select id from tags where name = any (${tags});`;
    tagIds = rows.map(r => r.id);
  }

  const recs = await getRecommendations({ userId: user.id, tagIds });

  return NextResponse.json({
    ok: true,
    user,
    tags: savedTags.map(r => r.name),
    recommendations: recs
  });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name') || '';
  const tags = searchParams.getAll('tags').length
    ? searchParams.getAll('tags')
    : searchParams.get('tags') || '';
  return handle({ name, tags });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return handle(body || {});
}
