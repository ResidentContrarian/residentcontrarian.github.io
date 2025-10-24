// app/page.js
'use client';
import { useState } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    setData(null);
    try {
      const res = await fetch('/api/jane', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, tags })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Request failed');
      setData(json);
    } catch (e) {
      setErr(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: '40px auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 12 }}>Personalized Recs (Demo)</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        <label>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Name</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jane"
            required
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
          />
        </label>

        <label>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Tags (comma or space separated, optional)</div>
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="litrpg fantasy"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #222',
            background: '#111',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Finding…' : 'Get Recommendations'}
        </button>
      </form>

      {err && <div style={{ color: 'crimson', marginBottom: 16 }}>Error: {err}</div>}

      {data && (
        <section>
          <div style={{ marginBottom: 8, color: '#666' }}>
            User: <b>{data.user?.name}</b> · Tags: {data.tags?.length ? data.tags.join(', ') : '—'}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
            {data.recommendations?.map(b => (
              <li key={b.id} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 10 }}>
                <div style={{ fontWeight: 600 }}>{b.title}</div>
                <div style={{ fontSize: 14, color: '#666' }}>
                  {b.author ? `by ${b.author}` : '—'} · score {b.score}
                  {Number(b.matches) > 0 ? ` · ${b.matches} tag match${b.matches > 1 ? 'es' : ''}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data && !err && (
        <p style={{ color: '#666' }}>
          Enter a name and (optionally) tags like <code>litrpg fantasy</code> to see seeded demo recs.
        </p>
      )}
    </main>
  );
}
