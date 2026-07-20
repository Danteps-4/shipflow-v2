"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import { MODULE_KEYS, MODULE_LABELS, ModuleKey } from "@/lib/modules";

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  modules: ModuleKey[];
  createdAt: string;
}

export default function EquipoPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checking, setChecking]       = useState(true);
  const [allowed, setAllowed]         = useState(false);
  const [users, setUsers]             = useState<TeamUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [savingId, setSavingId]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.role !== "admin") {
          router.replace("/");
          return;
        }
        setAllowed(true);
      })
      .finally(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    fetchUsers();
  }, [allowed]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const r = await fetch("/api/team");
      if (r.ok) setUsers((await r.json()).users ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function saveAccess(id: string, role: "admin" | "member", modules: ModuleKey[]) {
    setSavingId(id);
    try {
      await fetch(`/api/team/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, modules }),
      });
      await fetchUsers();
    } finally {
      setSavingId(null);
    }
  }

  function toggleModule(u: TeamUser, mod: ModuleKey) {
    const has = u.modules.includes(mod);
    const next = has ? u.modules.filter((m) => m !== mod) : [...u.modules, mod];
    saveAccess(u.id, u.role, next);
  }

  function changeRole(u: TeamUser, role: "admin" | "member") {
    saveAccess(u.id, role, u.modules);
  }

  if (checking || !allowed) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StoreSwitcher /><UserMenu />
        </div>
      </header>

      <main className="sf-main">
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Equipo</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Elegí qué módulos puede ver cada persona. Los administradores siempre ven todo.
          </p>

          {loading ? (
            <p style={{ color: "var(--text-muted)" }}>Cargando...</p>
          ) : (
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    {MODULE_KEYS.map((mod) => (
                      <th key={mod}>{MODULE_LABELS[mod]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          value={u.role}
                          disabled={savingId === u.id}
                          onChange={(e) => changeRole(u, e.target.value as "admin" | "member")}
                          style={{
                            background: "var(--surface-color)",
                            color: "var(--text-color)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius)",
                            padding: "0.3rem 0.5rem",
                            fontSize: "0.8rem",
                          }}
                        >
                          <option value="member">Miembro</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      {MODULE_KEYS.map((mod) => (
                        <td key={mod} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={u.role === "admin" || u.modules.includes(mod)}
                            disabled={u.role === "admin" || savingId === u.id}
                            onChange={() => toggleModule(u, mod)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>
    </div>
  );
}
