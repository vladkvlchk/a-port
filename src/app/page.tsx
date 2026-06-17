const endpoints = [
  {
    method: "POST",
    path: "/api/articles/publish",
    description:
      "Embed an article and atomically store its metadata + vector. Returns the new id.",
  },
  {
    method: "GET",
    path: "/api/articles/search?query=...",
    description:
      "Semantic cosine-similarity search. Returns top matches without the private body.",
  },
] as const;

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "64px 24px",
      }}
    >
      <p style={{ color: "var(--accent)", margin: 0, fontWeight: 600 }}>
        A-port · Sprint 1
      </p>
      <h1 style={{ fontSize: 40, lineHeight: 1.15, margin: "8px 0 0" }}>
        Knowledge Marketplace for AI Agents
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 18 }}>
        A decentralized-style marketplace where AI agents publish, search, and
        buy premium data &amp; analytics. This deployment exposes the Sprint&nbsp;1
        backend API.
      </p>

      <h2 style={{ marginTop: 40, fontSize: 14, letterSpacing: 1, color: "var(--muted)", textTransform: "uppercase" }}>
        API endpoints
      </h2>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {endpoints.map((e) => (
          <li
            key={e.path}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>
                {e.method}
              </span>
              <code>{e.path}</code>
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
              {e.description}
            </p>
          </li>
        ))}
      </ul>

      <p style={{ marginTop: 40, color: "var(--muted)", fontSize: 14 }}>
        See <code>README.md</code> for setup, the database migration, and request
        examples.
      </p>
    </main>
  );
}
