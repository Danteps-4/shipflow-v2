"use client";

import { useEffect, useRef, useState } from "react";

const SEEN_KEY = "conciliacion_last_seen_id";
const POLL_MS = 15000;

interface TransferenciaNotif {
  id: number;
  sender_name: string | null;
  amount_cents: string;
  estado: string;
  matched_order_number: string | null;
}

function esAccionable(estado: string): boolean {
  return estado === "REQUIRES_REVIEW" || estado === "AUTO_MATCHED";
}

function fmtPesos(cents: string): string {
  return (Number(cents) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mismo patrón que TicketsNotifier.tsx — avisa (sonido + toast + notif del
// navegador) cuando aparece una transferencia que necesita atención humana
// (revisión ambigua, o un match automático listo para el click final en
// Tiendanube). Las ya CONFIRMED/UNMATCHED/DUPLICATE_IGNORED no generan aviso.
export default function ConciliacionNotifier() {
  const [toast, setToast] = useState<TransferenciaNotif | null>(null);
  const lastSeenRef = useRef<number | null>(null);
  const hasAccessRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function checkNew() {
      if (cancelled || !hasAccessRef.current) return;
      try {
        const r = await fetch("/api/finanzas/conciliacion");
        if (!r.ok) return;
        const { transferencias } = (await r.json()) as { transferencias?: TransferenciaNotif[] };
        if (!Array.isArray(transferencias)) return;
        const accionables = transferencias.filter(t => esAccionable(t.estado));

        if (lastSeenRef.current === null) {
          const maxId = accionables.reduce((m, t) => Math.max(m, t.id), 0);
          lastSeenRef.current = maxId;
          localStorage.setItem(SEEN_KEY, String(maxId));
          return;
        }

        const nuevas = accionables.filter(t => t.id > lastSeenRef.current!).sort((a, b) => a.id - b.id);
        if (nuevas.length === 0) return;

        const maxId = Math.max(lastSeenRef.current, ...nuevas.map(t => t.id));
        lastSeenRef.current = maxId;
        localStorage.setItem(SEEN_KEY, String(maxId));

        const ultima = nuevas[nuevas.length - 1];
        playSound();
        setToast(ultima);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("Conciliación de transferencias", {
              body: `$${fmtPesos(ultima.amount_cents)} — ${ultima.sender_name ?? "sin nombre"}`,
            });
          } catch {}
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
        hasAccessRef.current = true;

        const stored = localStorage.getItem(SEEN_KEY);
        lastSeenRef.current = stored ? Number(stored) : null;

        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }

        await checkNew();
        intervalId = setInterval(checkNew, POLL_MS);
      } catch {}
    }

    init();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="alert"
      onClick={() => { window.location.href = "/finanzas/conciliacion-transferencias"; }}
      style={{
        position: "fixed", top: 80, right: 20, zIndex: 5000, cursor: "pointer",
        width: "min(340px, calc(100vw - 2.5rem))",
        background: "var(--surface-color)", border: "1px solid var(--border-color)",
        borderLeft: "4px solid var(--warning-color)", borderRadius: "var(--radius)",
        boxShadow: "0 15px 35px -8px rgba(0,0,0,0.6)", padding: "0.9rem 1rem",
        display: "flex", gap: "0.75rem", alignItems: "flex-start",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <i className="fas fa-money-bill-transfer" style={{ color: "var(--warning-color)", fontSize: "1.1rem", marginTop: "0.1rem" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.15rem" }}>
          {toast.estado === "AUTO_MATCHED" ? "Transferencia matcheada — falta confirmar" : "Transferencia necesita revisión"}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ${fmtPesos(toast.amount_cents)} — {toast.sender_name ?? "sin nombre"}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setToast(null); }}
        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.9rem", flexShrink: 0 }}
      >
        <i className="fas fa-times" />
      </button>
    </div>
  );
}

function playSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    beep(880, 0, 0.15);
    beep(1108, 0.18, 0.22);
  } catch {}
}
