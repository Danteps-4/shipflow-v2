"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

type Origen = "tienda_nube" | "mercado_libre";

interface EtiquetaDeposito {
  id: number;
  origen: Origen;
  titulo: string;
  url: string;
  estado: "pendiente" | "impresa";
  created_by: string;
  created_at: string;
  impresa_by: string | null;
  impresa_at: string | null;
}

// Colores de marca de cada transportista/plataforma, para que se distingan
// de un vistazo aunque el título no lo diga.
const ORIGEN_CONFIG: Record<Origen, { label: string; icon: string; color: string; bg: string }> = {
  tienda_nube:   { label: "Andreani (Tienda Nube)", icon: "fas fa-truck",    color: "#ff4757", bg: "rgba(255,71,87,0.14)" },
  mercado_libre: { label: "Mercado Libre",          icon: "fas fa-barcode", color: "#fff159", bg: "rgba(255,241,89,0.14)" },
};

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const POLL_MS = 15000;

export default function DepositoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [estado, setEstado]           = useState<"pendiente" | "impresa">("pendiente");
  const [etiquetas, setEtiquetas]     = useState<EtiquetaDeposito[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [busyId, setBusyId]           = useState<number | null>(null);

  const [subiendo, setSubiendo]       = useState(false);
  const [tituloManual, setTituloManual] = useState("");
  const [origenManual, setOrigenManual] = useState<Origen | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // silent = refresco de fondo (polling): no muestra el spinner ni tapa la
  // lista con "Cargando...", solo actualiza los datos cuando llegan.
  const fetchEtiquetas = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) { setLoading(true); setError(null); }
    try {
      const res = await fetch(`/api/deposito?estado=${estado}`);
      if (res.status === 401 || res.status === 403) { setError("No tenés acceso a este módulo."); return; }
      if (!res.ok) throw new Error("Error al cargar");
      const { etiquetas } = await res.json();
      setEtiquetas(etiquetas ?? []);
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [estado]);

  useEffect(() => { fetchEtiquetas(); }, [fetchEtiquetas]);

  // Se actualiza sola cada POLL_MS mientras la pantalla está abierta, para
  // que depósito vea las etiquetas nuevas sin tener que refrescar la página.
  useEffect(() => {
    const id = setInterval(() => fetchEtiquetas({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [fetchEtiquetas]);

  async function handleSubirManual(file: File) {
    if (!origenManual) return;
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("origen", origenManual);
      if (tituloManual.trim()) form.append("titulo", tituloManual.trim());
      const res = await fetch("/api/deposito", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al subir el archivo");
      }
      setTituloManual("");
      setOrigenManual("");
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
          <UserMenu />
        </div>
      </header>

      <main className="sf-main">
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Etiquetas para Depósito</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Etiquetas de todas las tiendas conectadas (Tienda Nube y Mercado Libre) listas para imprimir. Se suman solas al generarse, o subilas a mano.
          </p>

          {/* ── Subida manual ── */}
          <div style={{
            border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
            padding: "1rem", marginBottom: "1.5rem", display: "flex", gap: "0.75rem",
            alignItems: "center", flexWrap: "wrap", background: "rgba(255,255,255,0.02)",
          }}>
            <i className="fas fa-file-upload" style={{ color: "var(--text-muted)" }} />
            <select
              className="sf-input"
              value={origenManual}
              onChange={e => setOrigenManual(e.target.value as Origen | "")}
              style={{ maxWidth: 220 }}
              disabled={subiendo}
            >
              <option value="">¿Para qué es?</option>
              <option value="tienda_nube">Andreani (Tienda Nube)</option>
              <option value="mercado_libre">Mercado Libre</option>
            </select>
            <input
              type="text"
              className="sf-input"
              placeholder="Título (opcional)"
              value={tituloManual}
              onChange={e => setTituloManual(e.target.value)}
              style={{ maxWidth: 220 }}
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
              disabled={subiendo || !origenManual}
              title={!origenManual ? "Elegí primero para qué es" : undefined}
              style={{ opacity: subiendo || !origenManual ? 0.5 : 1, cursor: !origenManual ? "not-allowed" : "pointer" }}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
              {etiquetas.map(et => {
                // Fallback por si queda alguna etiqueta vieja con un origen
                // que ya no existe (ej. "manual" antes de pedir la plataforma).
                const cfg = ORIGEN_CONFIG[et.origen] ?? { label: "Sin clasificar", icon: "fas fa-file-pdf", color: "#94a3b8", bg: "rgba(148,163,184,0.14)" };
                return (
                  <div
                    key={et.id}
                    className="sf-card sf-etiqueta-card"
                    style={{
                      display: "flex", flexDirection: "column", gap: "1rem",
                      padding: "1.35rem", borderLeft: `4px solid ${cfg.color}`,
                      background: `linear-gradient(160deg, ${cfg.bg} 0%, var(--surface-color) 40%)`,
                      ["--card-color" as string]: cfg.color,
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "0.45rem",
                        padding: "0.3rem 0.75rem", borderRadius: "999px", background: cfg.bg, alignSelf: "flex-start",
                      }}
                    >
                      <i className={cfg.icon} style={{ color: cfg.color, fontSize: "0.72rem" }} />
                      <span style={{ fontSize: "0.73rem", fontWeight: 700, color: cfg.color, letterSpacing: "0.2px" }}>{cfg.label}</span>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.4, wordBreak: "break-word" }}>
                        {et.titulo}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                        <i className={`fas ${estado === "pendiente" ? "fa-clock" : "fa-circle-check"}`} style={{ fontSize: "0.72rem", flexShrink: 0 }} />
                        <span>
                          {estado === "pendiente"
                            ? `${fmtFecha(et.created_at)} · ${et.created_by}`
                            : `${et.impresa_at ? fmtFecha(et.impresa_at) : ""} · ${et.impresa_by ?? "—"}`
                          }
                        </span>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-color)" }} />

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      <a
                        href={et.url}
                        target="_blank"
                        rel="noreferrer"
                        className="sf-btn"
                        style={{ padding: "0.6rem", fontSize: "0.85rem", width: "100%" }}
                      >
                        <i className="fas fa-print" /> Ver / Imprimir
                      </a>
                      <div style={{ display: "flex", gap: "0.6rem" }}>
                        {estado === "pendiente" && (
                          <button
                            className="sf-btn sf-btn-secondary"
                            disabled={busyId === et.id}
                            onClick={() => marcarImpresa(et.id)}
                            style={{ padding: "0.5rem", fontSize: "0.82rem", flex: 1, justifyContent: "center" }}
                          >
                            <i className="fas fa-check" /> Marcar impresa
                          </button>
                        )}
                        <button
                          className="sf-icon-btn danger"
                          title="Borrar"
                          disabled={busyId === et.id}
                          onClick={() => borrar(et.id)}
                          style={estado === "impresa" ? { marginLeft: "auto" } : undefined}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </div>
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
