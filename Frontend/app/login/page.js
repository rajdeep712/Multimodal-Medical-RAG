"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login({ email: form.email, password: form.password });
      router.push("/protected");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card narrow stack">
      <div>
        <h1>Login</h1>
        <p className="muted">Sign in with secure HttpOnly session cookies.</p>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
          />
        </label>

        {error ? <p className="alert error">{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : "Login"}
        </button>
      </form>

      <p className="muted">
        Need an account? <Link href="/signup">Sign up</Link>
      </p>
    </section>
  );
}
