"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

interface EtiquetaDeposito {
  id: number;
  origen: "tienda_nube" | "mercado_libre" | "manual";
  titulo: string;
  url: string;
  estado: "pendiente" | "impresa";
  created_by: string;
  created_at: string;
  impresa_by: string | null;
  impresa_at: string | null;
}

const ORIGEN_CONFIG: Record<EtiquetaDeposito["origen"], { label: string; icon: string; color: string }> = {
  tienda_nube:   { label: "Tienda Nube",   icon: "fas fa-box-open",     color: "#3b82f6" },
  mercado_libre: { label: "Mercado Libre", icon: "fas fa-barcode",      color: "#eab308" },
  manual:        { label: "Subida manual", icon: "fas fa-file-upload", color: "#a78bfa" },
};

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function DepositoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [estado, setEstado]           = useState<"pendiente" | "impresa">("pendiente");
  const [etiquetas, setEtiquetas]     = useState<EtiquetaDeposito[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [busyId, setBusyId]           = useState<number | null>(null);

  const [subiendo, setSubiendo]       = useState(false);
  const [tituloManual, setTituloManual] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEtiquetas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deposito?estado=${estado}`);
      if (res.status === 401 || res.status === 403) { setError("No tenés acceso a este módulo."); return; }
      if (!res.ok) throw new Error("Error al cargar");
      const { etiquetas } = await res.json();
      setEtiquetas(etiquetas ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [estado]);

  useEffect(() => { fetchEtiquetas(); }, [fetchEtiquetas]);

  async function handleSubirManual(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (tituloManual.trim()) form.append("titulo", tituloManual.trim());
      const res = await fetch("/api/deposito", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al subir el archivo");
      }
      setTituloManual("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (estado === "pendiente") await fetchEtiquetas();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSubiendo(false);
    }
  }

  async function marcarImpresa(id: number) {
    setBusyId(id);
    try {
      await fetch("/api/deposito", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setEtiquetas(prev => prev.filter(e => e.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar esta etiqueta? No se puede deshacer.")) return;
    setBusyId(id);
    try {
      await fetch("/api/deposito", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setEtiquetas(prev => prev.filter(e => e.id !== id));
    } finally {
      setBusyId(null);
    }
  }

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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Etiquetas para Depósito</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Etiquetas de Tienda Nube y Mercado Libre listas para imprimir. Se suman solas al generarse, o subilas a mano.
          </p>

          {/* ── Subida manual ── */}
          <div style={{
            border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
            padding: "1rem", marginBottom: "1.5rem", display: "flex", gap: "0.75rem",
            alignItems: "center", flexWrap: "wrap", background: "rgba(255,255,255,0.02)",
          }}>
            <i className="fas fa-file-upload" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              className="sf-input"
              placeholder="Título (opcional)"
              value={tituloManual}
              onChange={e => setTituloManual(e.target.value)}
              style={{ maxWidth: 240 }}
              disabled={subiendo}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleSubirManual(f); }}
            />
            <button
              className="sf-btn sf-btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={subiendo}
              style={{ opacity: subiendo ? 0.6 : 1 }}
            >
              {subiendo
                ? <><i className="fas fa-spinner fa-spin" /> Subiendo…</>
                : <><i className="fas fa-plus" /> Subir PDF a mano</>
              }
            </button>
          </div>

          {/* ── Tabs pendiente/impresa ── */}
          <div className="sf-tabs" style={{ marginBottom: "1rem" }}>
            <button className={`sf-tab ${estado === "pendiente" ? "active" : ""}`} onClick={() => setEstado("pendiente")}>
              <i className="fas fa-clock" /> Pendientes
            </button>
            <button className={`sf-tab ${estado === "impresa" ? "active" : ""}`} onClick={() => setEstado("impresa")}>
              <i className="fas fa-check" /> Impresas
            </button>
          </div>

          {error && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.5rem" }} />Cargando...
            </div>
          ) : !error && etiquetas.length === 0 ? (
            <div className="sf-empty">
              <i className="fas fa-print sf-empty-icon" />
              <p style={{ fontWeight: 600, color: "var(--text-color)", marginBottom: "0.25rem" }}>
                {estado === "pendiente" ? "No hay etiquetas pendientes de imprimir" : "Todavía no hay etiquetas marcadas como impresas"}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
              {etiquetas.map(et => {
                const cfg = ORIGEN_CONFIG[et.origen];
                return (
                  <div key={et.id} className="sf-card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <i className={cfg.icon} style={{ color: cfg.color }} />
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{et.titulo}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {estado === "pendiente"
                        ? `Generado ${fmtFecha(et.created_at)} por ${et.created_by}`
                        : `Impreso ${et.impresa_at ? fmtFecha(et.impresa_at) : ""} por ${et.impresa_by ?? "—"}`
                      }
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                      <a
                        href={et.url}
                        target="_blank"
                        rel="noreferrer"
                        className="sf-btn"
                        style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
                      >
                        <i className="fas fa-print" /> Ver / Imprimir
                      </a>
                      {estado === "pendiente" && (
                        <button
                          className="sf-btn sf-btn-secondary"
                          disabled={busyId === et.id}
                          onClick={() => marcarImpresa(et.id)}
                          style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
                        >
                          <i className="fas fa-check" /> Marcar impresa
                        </button>
                      )}
                      <button
                        className="sf-icon-btn danger"
                        title="Borrar"
                        disabled={busyId === et.id}
                        onClick={() => borrar(et.id)}
                        style={{ marginLeft: "auto" }}
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  </div>
                );
              })}
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
