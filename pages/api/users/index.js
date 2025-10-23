// pages/api/users/index.js
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('users route OK');
}
