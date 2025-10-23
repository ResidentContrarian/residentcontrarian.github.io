import { useEffect, useState } from "react";

export default function AuthorsPage() {
  const [authors, setAuthors] = useState([]);

  useEffect(() => {
    fetch("/api/get-authors")
      .then(res => res.json())
      .then(data => setAuthors(data));
  }, []);

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Authors</h1>
      <ul>
        {authors.map(author => (
          <li key={author.id}>
            <a href={author.url}>{author.name}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
