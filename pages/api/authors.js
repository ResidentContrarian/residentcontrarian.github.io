// pages/api/authors.js
export default function handler(req, res) {
  res.status(200).json([
    { id: 1, name: "Jane Doe" },
    { id: 2, name: "John Smith" }
  ]);
}
