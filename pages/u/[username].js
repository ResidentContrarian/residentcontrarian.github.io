// pages/u/[username].js
import React from 'react';

export async function getServerSideProps(context) {
  const username = String(context.params.username || '').toLowerCase();
  // Get user's include tag slugs
  const base = process.env.NEXT_PUBLIC_BASE_URL || `http://${context.req.headers.host}`;
  // fetch tags they included
  const prefsRes = await fetch(`${base}/api/tags`);
  const allTags = (await prefsRes.json()).items || [];

  // Resolve user & includes via the DB-facing API (avoid exposing SQL here)
  const userRes = await fetch(`${base}/api/stories?q=`); // just to ensure base works
  if (!userRes.ok) {
    return { notFound: true };
  }

  // Inlined fetch: get include slugs for this user via the DB directly
  // Simpler: call stories endpoint with include=... once we’ve loaded their includes
  const includesRes = await fetch(`${base}/api/user-includes?username=${encodeURIComponent(username)}`).catch(()=>null);
  let includeSlugs = [];
  if (includesRes && includesRes.ok) {
    const d = await includesRes.json();
    includeSlugs = d.items || [];
  }

  // Build stories query with include_mode=all
  const storiesUrl = new URL(`${base}/api/stories`);
  if (includeSlugs.length) {
    storiesUrl.searchParams.set('include', includeSlugs.join(','));
    storiesUrl.searchParams.set('include_mode', 'all');
  }
  const storiesRes = await fetch(storiesUrl);
  const stories = storiesRes.ok ? (await storiesRes.json()).items || [] : [];

  return {
    props: {
      username,
      includeSlugs,
      stories
    }
  };
}

export default function UserPage({ username, includeSlugs, stories }) {
  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto' }}>
      <h1>/u/{username}</h1>
      <p>Tags (AND): {includeSlugs.length ? includeSlugs.join(', ') : '(none set)'}</p>
      <ul style={{ listStyle:'none', padding:0 }}>
        {stories.map(s => (
          <li key={s.id} style={{ border:'1px solid #eee', borderRadius:12, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:18, fontWeight:600 }}>{s.title}</div>
            <div style={{ opacity:0.7, margin:'4px 0' }}>by {s.author}</div>
            <div style={{ fontSize:14 }}>{s.summary}</div>
            <div style={{ fontSize:12, marginTop:6, opacity:0.8 }}>
              {s.tags?.map(t => <span key={t} style={{ marginRight:8 }}>#{t}</span>)}
            </div>
          </li>
        ))}
      </ul>
      {stories.length === 0 && <p>No stories match your current tags.</p>}
    </main>
  );
}
