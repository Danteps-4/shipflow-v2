"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import { MODULE_KEYS, MODULE_LABELS, ModuleKey } from "@/lib/modules";
import { ALL_HREFS, subApartadosForModule, hasLinkAccess } from "@/lib/navGroups";

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  modules: ModuleKey[];
  linkAccess?: string[];
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
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({});

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

  async function saveAccess(id: string, role: "admin" | "member", modules: ModuleKey[], linkAccess?: string[]) {
    setSavingId(id);
    try {
      await fetch(`/api/team/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, modules, linkAccess }),
      });
      await fetchUsers();
    } finally {
      setSavingId(null);
    }
  }

  function toggleModule(u: TeamUser, mod: ModuleKey) {
    const has = u.modules.includes(mod);
    const next = has ? u.modules.filter((m) => m !== mod) : [...u.modules, mod];
    saveAccess(u.id, u.role, next, u.linkAccess);
  }

  // linkAccess undefined = "todo permitido"; al tocar un sub apartado por
  // primera vez, se materializa la lista completa para poder sacar solo ese.
  function toggleSubApartado(u: TeamUser, href: string) {
    const current = u.linkAccess ?? ALL_HREFS;
    const has = current.includes(href);
    const next = has ? current.filter((h) => h !== href) : [...current, href];
    saveAccess(u.id, u.role, u.modules, next);
  }

  function changeRole(u: TeamUser, role: "admin" | "member") {
    saveAccess(u.id, role, u.modules, u.linkAccess);
  }

  function toggleExpand(userId: string, mod: ModuleKey) {
    const key = `${userId}:${mod}`;
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
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
            Elegí qué apartado —y qué sub apartado dentro de cada uno— puede ver cada persona. Los administradores siempre ven todo.
          </p>

          {loading ? (
            <p style={{ color: "var(--text-muted)" }}>Cargando...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    background: "rgba(15,23,42,0.5)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius)",
                    padding: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{u.name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{u.email}</div>
                    </div>
                    <select
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => changeRole(u, e.target.value as "admin" | "member")}
                      className="sf-input"
                      style={{ maxWidth: 140, fontSize: "0.85rem" }}
                    >
                      <option value="member">Miembro</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  {u.role === "admin" ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Admin: acceso total a todo.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {MODULE_KEYS.map((mod) => {
                        const subApartados = subApartadosForModule(mod);
                        const moduleChecked = u.modules.includes(mod);
                        const key = `${u.id}:${mod}`;
                        const isOpen = !!expanded[key];
                        return (
                          <div key={mod} style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.02)" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", flex: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={moduleChecked}
                                  disabled={savingId === u.id}
                                  onChange={() => toggleModule(u, mod)}
                                />
                                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{MODULE_LABELS[mod]}</span>
                              </label>
                              {subApartados.length > 0 && (
                                <button
                                  type="button"
                                  className="sf-icon-btn"
                                  title="Ver sub apartados"
                                  onClick={() => toggleExpand(u.id, mod)}
                                >
                                  <i
                                    className="fas fa-chevron-down"
                                    style={{ fontSize: "0.7rem", transition: "transform 0.2s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                                  />
                                </button>
                              )}
                            </div>
                            {subApartados.length > 0 && (
                              <SubApartadosPanel isOpen={isOpen}>
                                {subApartados.map((sub) => (
                                  <label
                                    key={sub.href}
                                    style={{
                                      display: "flex", alignItems: "center", gap: "0.5rem",
                                      padding: "0.4rem 0.75rem 0.4rem 2rem", fontSize: "0.85rem",
                                      cursor: moduleChecked ? "pointer" : "default",
                                      color: moduleChecked ? "var(--text-color)" : "var(--text-muted)",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={moduleChecked && hasLinkAccess(u.linkAccess, sub.href)}
                                      disabled={!moduleChecked || savingId === u.id}
                                      onChange={() => toggleSubApartado(u, sub.href)}
                                    />
                                    <i className={sub.icon} style={{ fontSize: "0.8rem", width: 14 }} />
                                    {sub.label}
                                  </label>
                                ))}
                              </SubApartadosPanel>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
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

// Mismo patrón que el Sidebar: mide la altura real en vez de animar
// grid-template-rows, que no se recalcula bien en todos los navegadores.
function SubApartadosPanel({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!outerRef.current || !innerRef.current) return;
    outerRef.current.style.maxHeight = isOpen ? `${innerRef.current.scrollHeight}px` : "0px";
  }, [isOpen, children]);

  return (
    <div ref={outerRef} style={{ maxHeight: isOpen ? undefined : 0, overflow: "hidden", transition: "max-height 0.2s ease" }}>
      <div ref={innerRef} style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}
