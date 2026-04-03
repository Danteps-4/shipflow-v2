"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UserMenu() {
  const router = useRouter();
  const [name, setName]       = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => setName(d.user?.name ?? null))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/user/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!name) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <span style={{
        fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120,
      }}>
        <i className="fas fa-circle-user" style={{ marginRight: "0.3rem", color: "var(--primary-color)" }} />
        {name}
      </span>
      <button
        onClick={handleLogout}
        disabled={loading}
        title="Cerrar sesión"
        style={{
          background: "none", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius)", padding: "0.3rem 0.6rem",
          color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem",
          whiteSpace: "nowrap",
        }}
      >
        <i className="fas fa-right-from-bracket" />
      </button>
    </div>
  );
}
