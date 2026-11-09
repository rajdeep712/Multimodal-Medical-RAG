"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { getPrivate } from "@/lib/api";

export default function ProtectedPage() {
  const router = useRouter();
  const { user, loading, authFetch, logout } = useAuth();
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const isAuthenticated = Boolean(user);

  const load = useCallback(async () => {
    setLoadingData(true);
    setError("");

    try {
      const result = await authFetch(() => getPrivate());
      setData(result);
    } catch (err) {
      if (err.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      setError(err.message);
    } finally {
      setLoadingData(false);
    }
  }, [authFetch, logout, router]);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    load();
  }, [loading, isAuthenticated, load, router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || loadingData) {
    return (
      <section className="card narrow">
        <p>Checking your session...</p>
      </section>
    );
  }

  if (!user) {
    return null;
  }

  if (error) {
    return (
      <section className="card narrow stack">
        <h1>Protected page</h1>
        <p className="alert error">{error}</p>
        <div className="row">
          <button type="button" onClick={load}>
            Retry
          </button>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="hero">
        <h1>Protected page</h1>
        <p className="muted">
          This data came from <code>GET /api/private</code> using an HttpOnly cookie.
        </p>
      </div>

      <div className="card stack">
        <h2>{data?.message || "Authenticated"}</h2>
        <p className="muted">Session user: {user.email || "unknown"}</p>
        <div className="row">
          <button type="button" onClick={load}>
            Reload data
          </button>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="card stack">
        <h2>API response</h2>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </section>
  );
}
