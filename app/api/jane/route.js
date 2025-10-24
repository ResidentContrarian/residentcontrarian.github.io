// app/api/jane/route.js
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true;
const sql = neon(process.env.NEON_DATABASE_URL);

function parseList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(parseList);
  return String(raw)
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

async function findUserByUsername(username) {
  if (!username) return null;
  const rows = await sql/*sql*/`
    select id, username, display_name
    from users
    where lower(username) = lower(${username})
    limit 1
  `;
  return rows[0] || null;
}

async function getRecommendationsByTags({ tagSlugsOrNames = [], limit = 12 }) {
  const tags = (tagSlugsOrNames || [])
    .map(t => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  let tagIds = [];
  if (tags.length) {
    const rows = await sql/*sql*/`
      with q as (
        select unnest(${sql.array(tags, 'text')}) as q
      )
      select t.id
      from tags t
      join q on lower(t.slug) = q.q or lower(t.name) = q.q
    `;
    tagIds = rows.map(r => r.id);
  }

  if (tagIds.length) {
    return sql/*sql*/`
      with wanted as (
        select unnest(${sql.array(tagIds, 'uuid')}) as tag_id
      ),
      hits as (
        select
          s.id,
          s.title,
          s.slug,
          s.summary,
          s.published_at,
          s.created_at,
          ap.pen_name,
          coalesce(v.followers, 0) as followers,
          count(*) as matches
        from stories s
        join story_tags st on st.story_id = s.id
        join wanted w on w.tag_id = st.tag_id
        left join v_story_follow_counts v on v.story_id = s.id
        left join author_profiles ap on ap.id = s.author_profile_id
        where s.deleted_at is null
        group by s.id, ap.pen_name, v.followers
      )
      select *
      from hits
      order by matches desc,
               followers desc,
               coalesce(published_at, created_at) desc
      limit ${limit}
    `;
  }

  return sql/*sql*/`
    select
      s.id,
      s.title,
      s.slug,
      s.summary,
      s.published_at,
      s.created_at,
      ap.pen_name,
      coalesce(v.followers, 0) as followers,
      0 as matches
    from stories s
    left join v_story_follow_counts v on v.story_id = s.id
    left join author_profiles ap on ap.id = s.author_profile_id
    where s.deleted_at is null
    order by followers desc, coalesce(published_at, created_at) desc, title asc
    limit ${limit}
  `;
}

async function handle(payload) {
  const name = (payload.name || payload.username || '').trim();
  const tags = parseList(payload.tags);

  const user = name ? await findUserByUsername(name) : null;
  const recs = await getRecommendationsByTags({ tagSlugsOrNames: tags, limit: 12 });

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
