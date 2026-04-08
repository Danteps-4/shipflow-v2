"use client";

import { useState, useRef, useEffect } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";

interface TrackingEntry {
  order: string;
  tracking: string;
}

interface TrackingResult extends TrackingEntry {
  status: "success" | "error" | "skipped";
  detail?: string;
}

export default function TrackingPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected]     = useState<boolean | null>(null);
  const [storeId, setStoreId]         = useState<number | null>(null);

  // Step 2 — PDF
  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [entries, setEntries]     = useState<TrackingEntry[] | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Step 3 — Send
  const [sending, setSending]     = useState(false);
  const [results, setResults]     = useState<TrackingResult[] | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Check auth status on load
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => {
        setConnected(d.connected);
        if (d.connected) setStoreId(d.store_id);
      })
      .catch(() => setConnected(false));
  }, []);

  async function handleDisconnect() {
    await fetch("/api/auth/logout", { method: "POST" });
    setConnected(false);
    setStoreId(null);
    setEntries(null);
    setResults(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") { setPdfFile(file); setEntries(null); setResults(null); }
  }

  async function handleExtract() {
    if (!pdfFile) return;
    setExtracting(true);
    setExtractError(null);
    setEntries(null);
    setResults(null);

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfB64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const res = await fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_b64: pdfB64 }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al extraer");
      const { entries: e } = await res.json();
      setEntries(e);
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSend() {
    if (!entries?.length) return;
    setSending(true);
    setSendError(null);
    setResults(null);

    try {
      const res = await fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al enviar");
      const { results: r } = await res.json();
      setResults(r);
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSending(false);
    }
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0;
  const errorCount   = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <div className={`sf-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sf-sidebar-header">
          <h3>Menú</h3>
          <button className="sf-close-btn" onClick={() => setSidebarOpen(false)}>
            <i className="fas fa-times" />
          </button>
        </div>
        <nav className="sf-nav">
          <a href="/"><i className="fas fa-house" /> Inicio</a>
          <a href="/orders"><i className="fas fa-receipt" /> Pedidos</a>
          <a href="/procesar"><i className="fas fa-file-excel" /> Procesar Pedidos</a>
          <a href="/etiquetas"><i className="fas fa-tags" /> Agregar SKU a Etiquetas</a>
          <a href="/tracking" className="active"><i className="fas fa-truck" /> Subir Tracking</a>
        </nav>
      </div>

      <div className={`sf-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────── */}
      <main className="sf-main">
        <div className="sf-container">

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Subir Tracking
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Extraé los números de seguimiento del PDF de Andreani y cargalos automáticamente en Tienda Nube.
          </p>

          {/* ── PASO 1: CONEXIÓN ─────────────────────────────────── */}
          <div className="sf-section-title">
            <div className={`sf-step-badge ${connected ? "" : "pending"}`}>
              {connected
                ? <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                : "1"
              }
            </div>
            <div>
              <h2>Conectar Tienda Nube</h2>
              <p>Autorizá el acceso a tu tienda para cargar los trackings</p>
            </div>
          </div>

          {connected === null && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.4rem" }} />
              Verificando conexión...
            </div>
          )}

          {connected === false && (
            <div style={{ marginBottom: "1.5rem" }}>
              <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
                <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
                <span>No estás conectado a Tienda Nube. Hacé click en el botón para autorizar.</span>
              </div>
              <a href="/api/auth/login" className="sf-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <i className="fas fa-link" /> Conectar con Tienda Nube
              </a>
            </div>
          )}

          {connected === true && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
              <div className="sf-alert sf-alert-ok" style={{ flex: 1, marginBottom: 0 }}>
                <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
                <span>Conectado a Tienda Nube · Store ID: <strong>{storeId}</strong></span>
              </div>
              <button
                onClick={handleDisconnect}
                style={{
                  background: "none", border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius)", padding: "0.5rem 0.85rem",
                  color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                }}
              >
                <i className="fas fa-unlink" style={{ marginRight: "0.35rem" }} />
                Desconectar
              </button>
            </div>
          )}

          {/* ── PASO 2: SUBIR PDF ────────────────────────────────── */}
          <hr className="sf-divider" />
          <div className="sf-section-title">
            <div className={`sf-step-badge ${entries ? "" : "pending"}`}>
              {entries
                ? <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                : "2"
              }
            </div>
            <div>
              <h2>Subir PDF de paquetes</h2>
              <p>El PDF descargado de Andreani con las etiquetas del envío</p>
            </div>
          </div>

          <div
            className={`sf-dropzone ${pdfFile ? "sf-dropzone--done" : ""}`}
            style={{ marginBottom: "1rem", opacity: !connected ? 0.5 : 1, pointerEvents: !connected ? "none" : "auto" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => connected && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setPdfFile(f); setEntries(null); setResults(null); }
              }}
            />
            {pdfFile ? (
              <>
                <i className="fas fa-circle-check" style={{ fontSize: "1.5rem", color: "var(--success-color)" }} />
                <span style={{ fontWeight: 600 }}>{pdfFile.name}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click para cambiar</span>
              </>
            ) : (
              <>
                <i className="fas fa-file-pdf" style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} />
                <span style={{ fontWeight: 600 }}>PDF de paquetes (Andreani)</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Arrastrá o hacé click</span>
              </>
            )}
          </div>

          {extractError && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
              <span>{extractError}</span>
            </div>
          )}

          <button
            className="sf-btn"
            onClick={handleExtract}
            disabled={!pdfFile || !connected || extracting}
            style={{ opacity: pdfFile && connected && !extracting ? 1 : 0.5, cursor: pdfFile && connected && !extracting ? "pointer" : "not-allowed", marginBottom: "1.5rem" }}
          >
            {extracting
              ? <><i className="fas fa-spinner fa-spin" /> Extrayendo...</>
              : <><i className="fas fa-magnifying-glass" /> Extraer trackings del PDF</>
            }
          </button>

          {/* ── PASO 3: PREVIEW + ENVIAR ─────────────────────────── */}
          {entries && (
            <>
              <hr className="sf-divider" />
              <div className="sf-section-title">
                <div className={`sf-step-badge ${results ? "" : "pending"}`}>
                  {results
                    ? <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                    : "3"
                  }
                </div>
                <div>
                  <h2>Confirmar y enviar</h2>
                  <p>{entries.length} pedidos encontrados en el PDF</p>
                </div>
              </div>

              {/* Preview table */}
              <div className="sf-table-wrap" style={{ marginBottom: "1.25rem" }}>
                <table className="sf-table">
                  <thead>
                    <tr>
                      <th>N° Orden</th>
                      <th>N° Seguimiento Andreani</th>
                      <th>URL Seguimiento</th>
                      {results && <th className="sticky-col" style={{ right: 0, left: "auto" }}>Estado</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => {
                      const r = results?.find((x) => x.order === e.order);
                      return (
                        <tr key={i} className={
                          r?.status === "success" ? "row-even" :
                          r?.status === "error"   ? "row-error" :
                          i % 2 === 0 ? "row-even" : "row-odd"
                        }>
                          <td style={{ fontFamily: "monospace", fontWeight: 600 }}>#{e.order}</td>
                          <td style={{ fontFamily: "monospace" }}>{e.tracking}</td>
                          <td style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            seguimiento.andreani.com/envio/{e.tracking}
                          </td>
                          {results && (
                            <td style={{ right: 0, left: "auto" }}>
                              {r?.status === "success" && (
                                <span className="sf-badge sf-badge-ok">
                                  <i className="fas fa-circle-check" /> OK
                                </span>
                              )}
                              {r?.status === "error" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start" }}>
                                  <span className="sf-badge sf-badge-error">
                                    <i className="fas fa-circle-exclamation" /> Error
                                  </span>
                                  {r.detail && (
                                    <span style={{ fontSize: "0.68rem", color: "var(--error-color)", maxWidth: 260, lineHeight: 1.3 }}>
                                      {r.detail}
                                    </span>
                                  )}
                                </div>
                              )}
                              {!r && <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {sendError && (
                <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
                  <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
                  <span>{sendError}</span>
                </div>
              )}

              {results && (
                <div className="sf-alert sf-alert-ok" style={{ marginBottom: "1rem" }}>
                  <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
                  <span>
                    {successCount} actualizados correctamente
                    {errorCount > 0 && <> · <span style={{ color: "var(--error-color)" }}>{errorCount} con errores</span></>}
                  </span>
                </div>
              )}

              {!results && (
                <button
                  className="sf-btn"
                  onClick={handleSend}
                  disabled={sending}
                  style={{ opacity: sending ? 0.5 : 1, cursor: sending ? "not-allowed" : "pointer" }}
                >
                  {sending
                    ? <><i className="fas fa-spinner fa-spin" /> Enviando...</>
                    : <><i className="fas fa-paper-plane" /> Cargar {entries.length} trackings en Tienda Nube</>
                  }
                </button>
              )}
            </>
          )}

        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>
    </div>
  );
}
