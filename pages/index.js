const resp = await fetch('/api/user-create', {
  method: 'POST',
  headers: { 'content-type':'application/json' },
  body: JSON.stringify({ username: uname })
});
