"use client";

import { useEffect, useRef, useState } from "react";

const READ_KEY = "conciliacion_read_ids";
const POLL_MS = 15000;

interface TransferenciaNotif {
  id: number;
  sender_name: string | null;
  amount_cents: string;
  estado: string;
  matched_order_number: string | null;
  created_at: string;
}

function esAccionable(estado: string): boolean {
  return estado === "REQUIRES_REVIEW" || estado === "AUTO_MATCHED";
}

function fmtPesos(cents: string): string {
  return (Number(cents) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// Mismo patrón que TicketsNotificationBell.tsx — campana con las
// transferencias que necesitan atención humana (REQUIRES_REVIEW o
// AUTO_MATCHED sin confirmar todavía). Vive en UserMenu junto a las otras.
export default function ConciliacionNotificationBell() {
  const [hasAccess, setHasAccess] = useState(false);
  const [items, setItems] = useState<TransferenciaNotif[]>([]);
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
        const r = await fetch("/api/finanzas/conciliacion");
        if (!r.ok) return;
        const { transferencias } = (await r.json()) as { transferencias?: TransferenciaNotif[] };
        if (!Array.isArray(transferencias)) return;
        const accionables = transferencias.filter(t => esAccionable(t.estado));
        setItems(accionables);

        if (!initializedRef.current) {
          initializedRef.current = true;
          const stored = loadRead();
          if (stored.size === 0 && accionables.length > 0) {
            const all = new Set(accionables.map(t => t.id));
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
        const hasModule = isAdmin || (user.modules ?? []).includes("finanzas");
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

  const sorted = [...items].sort((a, b) => b.id - a.id).slice(0, 20);
  const unreadCount = sorted.filter(t => !readIds.has(t.id)).length;

  function markAllRead() {
    const next = new Set(readIds);
    sorted.forEach(t => next.add(t.id));
    setReadIds(next);
    saveRead(next);
  }

  function markRead(t: TransferenciaNotif) {
    const next = new Set(readIds);
    next.add(t.id);
    setReadIds(next);
    saveRead(next);
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Conciliación de transferencias"
        style={{
          background: "none", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius)", padding: "0.35rem 0.6rem",
          color: "var(--text-color)", cursor: "pointer", fontSize: "0.85rem",
          position: "relative", display: "flex", alignItems: "center",
        }}
      >
        <i className="fas fa-money-bill-transfer" />
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
            <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>Conciliación de transferencias</span>
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
              No hay transferencias pendientes de atención.
            </div>
          ) : (
            sorted.map(t => {
              const unread = !readIds.has(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => { markRead(t); window.location.href = "/finanzas/conciliacion-transferencias"; }}
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
                    <div style={{ fontSize: "0.82rem", fontWeight: unread ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      ${fmtPesos(t.amount_cents)} — {t.sender_name ?? "sin nombre"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      {t.estado === "AUTO_MATCHED" ? `Matcheada con #${t.matched_order_number}` : "Requiere revisión"} · {fmtRelative(t.created_at)}
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
