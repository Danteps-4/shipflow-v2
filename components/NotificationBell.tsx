"use client";

import { useEffect, useRef, useState } from "react";

const READ_KEY = "soporte_read_ticket_ids";
const POLL_MS = 15000;

interface TicketNotif {
  id: number;
  titulo: string;
  categoria: string;
  estado: string;
  created_at: string;
}

function loadRead(): Set<number> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveRead(set: Set<number>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

// Botón de campana con el historial de notificaciones (por ahora, tickets de
// soporte). Vive dentro de UserMenu para aparecer en el header de cada
// página sin tener que tocar los ~15 lugares que ya renderizan <UserMenu/>.
export default function NotificationBell() {
  const [hasAccess, setHasAccess] = useState(false);
  const [tickets, setTickets] = useState<TicketNotif[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const initializedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch("/api/soporte/tickets");
        if (!r.ok) return;
        const { tickets: list } = (await r.json()) as { tickets?: TicketNotif[] };
        if (!Array.isArray(list)) return;
        setTickets(list);

        if (!initializedRef.current) {
          initializedRef.current = true;
          const stored = loadRead();
          if (stored.size === 0 && list.length > 0) {
            // Primera vez que corre esta feature: no avisar retroactivo por
            // tickets que ya existían.
            const all = new Set(list.map((t) => t.id));
            saveRead(all);
            setReadIds(all);
          } else {
            setReadIds(stored);
          }
        }
      } catch {}
    }

    async function init() {
      try {
        const meRes = await fetch("/api/user/me");
        const me = await meRes.json();
        const user = me.user;
        if (!user) return;
        const isAdmin = user.role === "admin";
        const hasModule = isAdmin || (user.modules ?? []).includes("soporte");
        if (!hasModule) return;
        setHasAccess(true);

        await poll();
        intervalId = setInterval(poll, POLL_MS);
      } catch {}
    }

    init();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!hasAccess) return null;

  const sorted = [...tickets].sort((a, b) => b.id - a.id).slice(0, 20);
  const unreadCount = sorted.filter((t) => !readIds.has(t.id)).length;

  function markAllRead() {
    const next = new Set(readIds);
    sorted.forEach((t) => next.add(t.id));
    setReadIds(next);
    saveRead(next);
  }

  function markRead(t: TicketNotif) {
    const next = new Set(readIds);
    next.add(t.id);
    setReadIds(next);
    saveRead(next);
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notificaciones"
        style={{
          background: "none", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius)", padding: "0.35rem 0.6rem",
          color: "var(--text-color)", cursor: "pointer", fontSize: "0.85rem",
          position: "relative", display: "flex", alignItems: "center",
        }}
      >
        <i className="fas fa-bell" />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute", top: -5, right: -5,
              background: "#ef4444", color: "#fff", borderRadius: "999px",
              fontSize: "0.62rem", fontWeight: 700, lineHeight: 1,
              padding: "2px 4px", minWidth: 15, textAlign: "center",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 4000,
            width: 320, maxHeight: 420, overflowY: "auto",
            background: "var(--surface-color)", border: "1px solid var(--border-color)",
            borderRadius: "var(--radius)", boxShadow: "0 15px 35px -8px rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.7rem 0.9rem", borderBottom: "1px solid var(--border-color)",
              position: "sticky", top: 0, background: "var(--surface-color)",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>Notificaciones</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: "none", border: "none", color: "var(--primary-color)", fontSize: "0.72rem", cursor: "pointer" }}
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {sorted.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              No hay tickets de soporte todavía.
            </div>
          ) : (
            sorted.map((t) => {
              const unread = !readIds.has(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => { markRead(t); window.location.href = "/soporte"; }}
                  style={{
                    display: "flex", gap: "0.6rem", alignItems: "flex-start",
                    padding: "0.7rem 0.9rem", cursor: "pointer",
                    borderBottom: "1px solid var(--border-color)",
                    background: unread ? "rgba(59,130,246,0.08)" : "transparent",
                  }}
                >
                  <span
                    style={{
                      marginTop: 5, width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: unread ? "var(--primary-color)" : "transparent",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.82rem", fontWeight: unread ? 700 : 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {t.titulo}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      {t.categoria} · {fmtRelative(t.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}
