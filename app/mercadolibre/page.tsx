"use client";

import { useEffect, useState } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

interface StatusResponse {
  connected: boolean;
  nickname?: string;
  noTnStore?: boolean;
}

export default function MercadoLibrePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mercadolibre/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setError("No se pudo consultar el estado de la conexión"))
      .finally(() => setLoading(false));
  }, []);

  async function handleDisconnect() {
    if (!confirm("¿Desconectar la cuenta de Mercado Libre?")) return;
    setError(null);
    try {
      const res = await fetch("/api/mercadolibre/disconnect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error del servidor (HTTP ${res.status})`);
      setStatus({ connected: false });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido al desconectar");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand">
          <i className="fas fa-rocket" />
          ShipFlow
        </a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
      </header>

      <main className="sf-main">
        <div className="sf-container">

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Conectar Mercado Libre
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Vinculá tu cuenta de vendedor para ver los pedidos de Mercado Libre y generar sus etiquetas.
          </p>

          {error && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <p style={{ color: "var(--text-muted)" }}>Cargando...</p>
          ) : status?.noTnStore ? (
            <div className="sf-alert sf-alert-warning">
              <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
              <span>Conectá primero una tienda de Tienda Nube: la conexión de Mercado Libre se asocia a esa tienda.</span>
            </div>
          ) : status?.connected ? (
            <>
              <div className="sf-alert sf-alert-ok" style={{ marginBottom: "1.5rem" }}>
                <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
                <span>Conectado como <strong>{status.nickname}</strong>.</span>
              </div>

              <a href="/mercadolibre/pedidos" className="sf-btn sf-btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "1.5rem" }}>
                <i className="fas fa-receipt" /> Ver pedidos de Mercado Libre
              </a>

              <div>
                <button
                  onClick={handleDisconnect}
                  style={{ background: "none", border: "none", color: "var(--danger-color, #ef4444)", cursor: "pointer", fontSize: "0.85rem", padding: 0 }}
                >
                  <i className="fas fa-plug-circle-xmark" /> Desconectar cuenta de Mercado Libre
                </button>
              </div>
            </>
          ) : (
            <a className="sf-btn" href="/api/auth/ml/connect">
              <i className="fas fa-plug" /> Conectar cuenta de Mercado Libre
            </a>
          )}

        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>
    </div>
  );
}
