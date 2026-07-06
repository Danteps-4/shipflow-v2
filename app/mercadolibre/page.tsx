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

interface SyncResult {
  ordenes: number;
  lineasProcesadas: number;
  insuficiente: { sku: string; nombre: string; disponible: number; solicitado: number }[];
}

export default function MercadoLibrePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mercadolibre/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setError("No se pudo consultar el estado de la conexión"))
      .finally(() => setLoading(false));
  }, []);

  async function handleDisconnect() {
    if (!confirm("¿Desconectar la cuenta de Mercado Libre? Dejará de descontarse stock automáticamente por ventas de ML.")) return;
    await fetch("/api/mercadolibre/disconnect", { method: "POST" });
    setStatus({ connected: false });
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/mercadolibre/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al sincronizar");
      setSyncResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSyncing(false);
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
            Vinculá tu cuenta de vendedor para que cada venta paga descuente stock automáticamente,
            en tiempo real, con el mismo criterio que Tienda Nube.
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
                <span>Conectado como <strong>{status.nickname}</strong>. Las ventas pagas descuentan stock automáticamente.</span>
              </div>

              <div className="sf-section-title">
                <div className="sf-step-badge"><i className="fas fa-rotate" style={{ fontSize: "0.65rem" }} /></div>
                <div>
                  <h2>Sincronizar pedidos recientes</h2>
                  <p>Trae las ventas pagas de los últimos 7 días y recalcula el stock — útil si algún webhook no llegó. Reprocesar pedidos ya descontados no duplica el descuento.</p>
                </div>
              </div>

              <button className="sf-btn" onClick={handleSync} disabled={syncing} style={{ marginBottom: "1rem" }}>
                {syncing
                  ? <><i className="fas fa-spinner fa-spin" /> Sincronizando...</>
                  : <><i className="fas fa-rotate" /> Sincronizar ahora</>
                }
              </button>

              {syncResult && (
                <div className="sf-alert sf-alert-ok" style={{ marginBottom: "1rem" }}>
                  <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
                  <span>
                    {syncResult.ordenes} pedidos revisados, {syncResult.lineasProcesadas} líneas descontadas.
                    {syncResult.insuficiente.length > 0 && ` ${syncResult.insuficiente.length} SKU con stock insuficiente.`}
                  </span>
                </div>
              )}

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
