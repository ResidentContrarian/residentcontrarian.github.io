import { useState, useEffect } from 'react';

export default function Home(){
  const [notes,setNotes]=useState([]), [msg,setMsg]=useState('');
  useEffect(()=>{ fetch('/api/notes').then(r=>r.json()).then(d=>setNotes(d.notes||[])); },[]);
  async function add(e){ e.preventDefault();
    const r=await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg})});
    const d=await r.json(); if(d.ok){ setNotes([d.note,...notes]); setMsg(''); }
  }
  return (<div style={{padding:20}}>
    <h1>ok</h1>
    <form onSubmit={add}><input value={msg} onChange={e=>setMsg(e.target.value)} placeholder="note"/><button>Add</button></form>
    <ul>{notes.map(n=><li key={n.id}>{n.msg}</li>)}</ul>
  </div>);
}
