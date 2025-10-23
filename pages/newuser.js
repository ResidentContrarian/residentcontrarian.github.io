// pages/newuser.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function NewUser() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [tags, setTags] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // load tags when we enter step 2
  useEffect(() => {
    if (step !== 2) return;
    (async () => {
      try {
        setErr("");
        const res = await fetch("/api/get-tags");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setTags(data);
      } catch (e) {
        setErr(e.message || "Failed to load tags");
      }
    })();
  }, [step]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const nextFromUsername = () => {
    const u = username.trim();
    if (!u) { setErr("Enter a username."); return; }
    setErr("");
    setStep(2);
  };

  const nextFromTags = () => {
    if (!selected.size) { setErr("Pick at least one tag."); return; }
    setErr("");
    setStep(3);
  };

  const generate = async () => {
    try {
      setLoading(true);
      setErr("");
      const likedTagIds = Array.from(selected);
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), likedTagIds })
      });
      if (!res.ok) throw new Error((await res.json()).error || "Create failed");
      router.push(`/u/${encodeURIComponent(username.trim())}`);
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,Arial", padding:24, maxWidth:820}}>
      <h1 style={{marginBottom:12}}>Make your page</h1>
      {err && <div style={{color:"#b00020", marginBottom:12}}>{err}</div>}

      {step === 1 && (
        <section>
          <h3>1) Pick a username</h3>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. jacob"
            style={{padding:"8px 10px", width:320, marginRight:8}}
          />
          <button onClick={nextFromUsername} style={{padding:"8px 14px"}}>Next</button>
        </section>
      )}

      {step === 2 && (
        <section>
          <h3>2) What tags do you like?</h3>
          {tags.length === 0 ? (
            <div>Loading tags…</div>
          ) : (
            <div style={{
              display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",
              gap:10, margin:"10px 0 16px"
            }}>
              {tags.map(t => (
                <label key={t.id} style={{
                  border:"1px solid #ddd", padding:"8px 10px",
                  borderRadius:8, display:"flex", alignItems:"center", gap:8,
                  background: selected.has(t.id) ? "#eef6ff" : "white"
                }}>
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          )}
          <button onClick={() => setStep(1)} style={{padding:"8px 14px", marginRight:8}}>Back</button>
          <button onClick={nextFromTags} style={{padding:"8px 14px"}}>Continue</button>
        </section>
      )}

      {step === 3 && (
        <section>
          <h3>3) Generate your page</h3>
          <button onClick={generate} disabled={loading} style={{padding:"8px 14px"}}>
            {loading ? "Generating…" : "Generate & go"}
          </button>
          <div style={{marginTop:12}}>
            <button onClick={() => setStep(2)} style={{padding:"6px 12px"}}>Back</button>
          </div>
        </section>
      )}
    </main>
  );
}
