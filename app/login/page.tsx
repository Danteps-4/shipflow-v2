"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      router.push("/");
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg-color)", padding: "1.5rem",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            width: 52, height: 52, borderRadius: "var(--radius)",
            background: "var(--primary-color)", display: "inline-flex",
            alignItems: "center", justifyContent: "center", marginBottom: "0.75rem",
          }}>
            <i className="fas fa-rocket" style={{ fontSize: "1.4rem", color: "#fff" }} />
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>ShipFlow</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Iniciá sesión para continuar
          </p>
        </div>

        {/* Card */}
        <div className="sf-card" style={{ padding: "1.75rem" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {error && (
              <div className="sf-alert sf-alert-warning">
                <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="sf-form-field">
              <label className="sf-form-label">Email</label>
              <input
                type="email"
                className="sf-form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoFocus
              />
            </div>

            <div className="sf-form-field">
              <label className="sf-form-label">Contraseña</label>
              <input
                type="password"
                className="sf-form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="sf-btn"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}
            >
              {loading
                ? <><i className="fas fa-spinner fa-spin" /> Ingresando…</>
                : <><i className="fas fa-right-to-bracket" /> Ingresar</>
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "1.25rem" }}>
          ¿No tenés cuenta?{" "}
          <a href="/register" style={{ color: "var(--primary-color)", fontWeight: 600 }}>
            Registrate
          </a>
        </p>
      </div>
    </div>
  );
}
