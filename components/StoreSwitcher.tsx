"use client";

import { useState, useEffect, useRef } from "react";

interface StoreInfo {
  user_id: number;
  store_name: string;
  connected_at: string;
}

interface StatusResponse {
  connected: boolean;
  active: number | null;
  stores: StoreInfo[];
}

export default function StoreSwitcher() {
  const [status, setStatus]   = useState<StatusResponse | null>(null);
  const [open, setOpen]       = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    fetch("/api/auth/status")
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }

  useEffect(() => { load(); }, []);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleSwitch(storeId: number) {
    setSwitching(true);
    await fetch("/api/auth/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    await load();
    setSwitching(false);
    setOpen(false);
    // Reload current page data
    window.location.reload();
  }

  async function handleDisconnect(e: React.MouseEvent, storeId: number) {
    e.stopPropagation();
    await fetch("/api/auth/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    await load();
    setOpen(false);
  }

  if (!status) return null;
  if (!status.connected) {
    return (
      <a href="/api/auth/login" style={{
        display: "inline-flex", alignItems: "center", gap: "0.4rem",
        fontSize: "0.78rem", color: "var(--primary-color)",
        textDecoration: "none", padding: "0.35rem 0.75rem",
        border: "1px solid var(--primary-color)", borderRadius: "var(--radius)",
        transition: "background 0.15s",
      }}>
        <i className="fas fa-link" /> Conectar tienda
      </a>
    );
  }

  const activeStore = status.stores.find(s => s.user_id === status.active);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius)", padding: "0.35rem 0.75rem",
          color: "var(--text-color)", cursor: "pointer", fontSize: "0.78rem",
          transition: "background 0.15s",
          maxWidth: 200,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          backgroundColor: "var(--success-color)", flexShrink: 0,
        }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
          {activeStore?.store_name ?? `Tienda ${status.active}`}
        </span>
        <i className={`fas fa-chevron-${open ? "up" : "down"}`} style={{ fontSize: "0.65rem", flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "var(--surface-color)", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius)", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          minWidth: 240, zIndex: 1000, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "0.6rem 0.9rem", borderBottom: "1px solid var(--border-color)",
            fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            Tiendas conectadas
          </div>

          {/* Store list */}
          {status.stores.map(store => {
            const isActive = store.user_id === status.active;
            return (
              <div
                key={store.user_id}
                onClick={() => !isActive && !switching && handleSwitch(store.user_id)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.65rem 0.9rem",
                  cursor: isActive ? "default" : "pointer",
                  background: isActive ? "rgba(59,130,246,0.08)" : "transparent",
                  transition: "background 0.15s",
                  borderBottom: "1px solid var(--border-color)",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isActive ? "rgba(59,130,246,0.08)" : "transparent"; }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  backgroundColor: isActive ? "var(--success-color)" : "var(--border-color)",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: isActive ? 600 : 400, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {store.store_name}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    ID: {store.user_id}
                    {isActive && <span style={{ marginLeft: "0.4rem", color: "var(--success-color)" }}>· activa</span>}
                  </div>
                </div>
                {isActive && switching && (
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }} />
                )}
                {/* Disconnect button */}
                <button
                  onClick={e => handleDisconnect(e, store.user_id)}
                  title="Desconectar"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-muted)", padding: "0.2rem 0.3rem",
                    borderRadius: "4px", fontSize: "0.75rem", flexShrink: 0,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--error-color)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                >
                  <i className="fas fa-xmark" />
                </button>
              </div>
            );
          })}

          {/* Add store */}
          <a
            href="/api/auth/login"
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.65rem 0.9rem", textDecoration: "none",
              color: "var(--primary-color)", fontSize: "0.82rem",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.06)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
          >
            <i className="fas fa-plus" style={{ fontSize: "0.75rem" }} />
            Conectar otra tienda
          </a>
        </div>
      )}
    </div>
  );
}
