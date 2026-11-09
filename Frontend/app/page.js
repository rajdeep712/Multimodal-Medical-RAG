import Link from "next/link";

export default function Home() {
  return (
    <section className="stack">
      <div className="hero">
        <h1>RAG Auth Test</h1>
        <p className="muted">
          Minimal Next.js frontend for the FastAPI + Auth0 backend.
        </p>
      </div>

      <div className="card stack">
        <h2>Test the API</h2>
        <ul className="links">
          <li>
            <Link href="/signup">Sign up</Link> — creates an Auth0 user and logs in.
          </li>
          <li>
            <Link href="/login">Login</Link> — sets secure HttpOnly session cookies.
          </li>
          <li>
            <Link href="/protected">Protected</Link> — calls <code>/api/private</code>{" "}
            with cookies.
          </li>
        </ul>
        <p className="muted">
          API URL:{" "}
          <code>{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}</code>
        </p>
      </div>
    </section>
  );
}
