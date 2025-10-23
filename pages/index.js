// pages/index.js
import { useEffect, useState } from 'react';

export default function Home() {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [tags, setTags] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load tags for step 2
  useEffect(() => {
    if (step === 2 && tags.length === 0) {
      fetch('/api/tags')
        .then(r => r.json())
        .then(d => { if (d.ok) setTags(d.items); });
    }
  }, [step, tags.length]);

  async function handleUsernameSubmit(e) {
    e.preventDefault();
    setError('');
    const uname = username.trim().toLowerCase();
    if (!uname) return setError('Please enter a username.');
    setLoading(true);
    const resp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ username: uname })
    });
    const data = await resp.json();
    setLoading(false);
    if (!data.ok) return setError(data.error || 'Failed to create user');
    setStep(2);
  }

  async function handleTagsSubmit(e) {
    e.preventDefault();
    setError('');
    const include_slugs = Array.from(selected);
    if (include_slugs.length === 0) return setError('Pick at least one tag.');
    setLoading(true);
    const resp = await fetch(`/api/users/${encodeURIComponent(username.trim().toLowerCase())}/preferences`, {
      method: 'PUT',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ include_slugs })
    });
    const data = await resp.json();
    setLoading(false);
    if (!data.ok) return setError(data.error || 'Failed to save preferences');
    // Go to persistent page
    window.location.href = `/u/${encodeURIComponent(username.trim().toLowerCase())}`;
  }

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto' }}>
      <h1>Welcome</h1>
      {error ? <p style={{ color:'crimson' }}>{error}</p> : null}

      {step === 1 && (
        <form onSubmit={handleUsernameSubmit}>
          <label>
            What is your username?
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g., jane"
              style={{ display:'block', marginTop:8, padding:8, width:'100%' }}
            />
          </label>
          <button disabled={loading} type="submit" style={{ marginTop:12, padding:'8px 12px' }}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleTagsSubmit}>
          <p>Pick your tags:</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:8 }}>
            {tags.map(t => {
              const checked = selected.has(t.slug);
              return (
                <label key={t.slug} style={{ border:'1px solid #ddd', borderRadius:8, padding:8, cursor:'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(t.slug); else next.add(t.slug);
                      setSelected(next);
                    }}
                    style={{ marginRight:8 }}
                  />
                  {t.name}
                </label>
              );
            })}
          </div>
          <button disabled={loading} type="submit" style={{ marginTop:12, padding:'8px 12px' }}>
            {loading ? 'Saving...' : 'See my page'}
          </button>
        </form>
      )}
    </main>
  );
}
