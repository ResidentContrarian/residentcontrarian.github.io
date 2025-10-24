// lib/db.js
import { neon } from '@neondatabase/serverless';

/**
 * Uses NEON_DATABASE_URL (set this in Vercel > Settings > Environment Variables).
 */
export const sql = neon(process.env.NEON_DATABASE_URL);

/**
 * Create demo tables + seed minimal data idempotently.
 */
export async function ensureSchema() {
  await sql/*sql*/`
    create table if not exists users (
      id serial primary key,
      name text not null unique,
      created_at timestamptz default now()
    );

    create table if not exists tags (
      id serial primary key,
      name text not null unique
    );

    create table if not exists books (
      id serial primary key,
      title text not null,
      author text,
      score int default 0,
      created_at timestamptz default now()
    );

    create table if not exists user_tags (
      user_id int references users(id) on delete cascade,
      tag_id int references tags(id) on delete cascade,
      primary key(user_id, tag_id)
    );

    create table if not exists book_tags (
      book_id int references books(id) on delete cascade,
      tag_id int references tags(id) on delete cascade,
      primary key(book_id, tag_id)
    );
  `;

  // Seed tags
  const seedTags = ['litrpg', 'fantasy', 'scifi', 'romance'];
  await sql/*sql*/`
    insert into tags (name)
    select t.name
    from (values ${seedTags.map(t => `('${t}')`).join(',')}) as t(name)
    on conflict (name) do nothing;
  `;

  // Seed books (tiny demo)
  await sql/*sql*/`
    insert into books (title, author, score) values
      ('Dungeon Diver Zero', 'A. Harper', 95),
      ('Starship Salvagers', 'K. Lin', 88),
      ('Court of Amber Vines', 'M. Darel', 76),
      ('Numbers and Knights', 'J. Padeca', 91)
    on conflict do nothing;
  `;

  // Link book->tags
  const tagRows = await sql/*sql*/`select id, name from tags`;
  const tagId = name => tagRows.find(t => t.name === name)?.id;

  const maps = [
    { title: 'Dungeon Diver Zero', tags: ['litrpg', 'fantasy'] },
    { title: 'Starship Salvagers', tags: ['scifi'] },
    { title: 'Court of Amber Vines', tags: ['fantasy', 'romance'] },
    { title: 'Numbers and Knights', tags: ['litrpg'] }
  ];

  for (const m of maps) {
    const [b] = await sql/*sql*/`select id from books where title = ${m.title} limit 1`;
    if (!b) continue;
    for (const t of m.tags) {
      const tid = tagId(t);
      if (!tid) continue;
      await sql/*sql*/`
        insert into book_tags (book_id, tag_id)
        values (${b.id}, ${tid})
        on conflict do nothing;
      `;
    }
  }
}

/**
 * Upsert a user by name and attach any provided tag names.
 * Returns { user, tag_ids }
 */
export async function upsertUserWithTags(name, tagNames = []) {
  if (!name || !name.trim()) throw new Error('Name is required');
  const clean = name.trim();

  const [user] = await sql/*sql*/`
    insert into users (name) values (${clean})
    on conflict (name) do update set name = excluded.name
    returning id, name, created_at;
  `;

  let tagIds = [];
  if (tagNames.length) {
    // ensure tags exist
    await sql/*sql*/`
      insert into tags (name)
      select v.name
      from (values ${tagNames.map(t => `('${t.trim().toLowerCase()}')`).join(',')}) as v(name)
      on conflict (name) do nothing;
    `;
    const rows = await sql/*sql*/`
      select id from tags where name = any (${tagNames.map(t => t.trim().toLowerCase())});
    `;
    tagIds = rows.map(r => r.id);

    // link user->tags
    for (const tid of tagIds) {
      await sql/*sql*/`
        insert into user_tags (user_id, tag_id)
        values (${user.id}, ${tid})
        on conflict do nothing;
      `;
    }
  }

  return { user, tag_ids: tagIds };
}

/**
 * Get recommended books based on user or provided tag ids.
 * Simple heuristic: count of matching tags desc, then score desc, then title.
 */
export async function getRecommendations({ userId, tagIds = [], limit = 10 }) {
  // If no tagIds provided, read user’s saved tags
  if (!tagIds.length && userId) {
    const rows = await sql/*sql*/`
      select tag_id from user_tags where user_id = ${userId};
    `;
    tagIds = rows.map(r => r.tag_id);
  }

  if (tagIds.length) {
    return sql/*sql*/`
      with hits as (
        select b.id, b.title, b.author, b.score,
               count(bt.tag_id) as matches
        from books b
        join book_tags bt on bt.book_id = b.id
        where bt.tag_id = any (${tagIds})
        group by b.id
      )
      select * from hits
      order by matches desc, score desc, title asc
      limit ${limit};
    `;
  }

  // Fallback: top scored books
  return sql/*sql*/`
    select id, title, author, score, 0 as matches
    from books
    order by score desc, title asc
    limit ${limit};
  `;
}
