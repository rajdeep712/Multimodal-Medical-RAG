"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const data = await signup({
        email: form.email,
        password: form.password,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
      });

      if (data?.authenticated) {
        router.push("/protected");
        return;
      }

      setMessage(data?.message || "Account created. Please log in.");
      setForm((current) => ({ ...current, password: "" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card narrow stack">
      <div>
        <h1>Sign up</h1>
        <p className="muted">Create an account through the FastAPI backend.</p>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Name (optional)
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            autoComplete="name"
          />
        </label>
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
            minLength={8}
            value={form.password}
            onChange={handleChange}
            autoComplete="new-password"
          />
        </label>

        {error ? <p className="alert error">{error}</p> : null}
        {message ? <p className="alert success">{message}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="muted">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
      {message ? (
        <p>
          <Link href="/login">Go to login</Link>
        </p>
      ) : null}
    </section>
  );
}
