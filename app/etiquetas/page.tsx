"use client";

import { useState, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

type FileState = { file: File; name: string } | null;
type SkuItem    = { sku: string; cantidad: number };
type ParsedOrders = Record<string, { nombre: string; skus: SkuItem[] }>;

// ── DropZone ─────────────────────────────────────────────────────────
function DropZone({
  label, accept, icon, value, onChange,
}: {
  label: string; accept: string; icon: string;
  value: FileState; onChange: (f: FileState) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onChange({ file, name: file.name });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onChange({ file, name: file.name });
  }

  return (
    <div
      className={`sf-dropzone ${value ? "sf-dropzone--done" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={handleChange} />
      {value ? (
        <>
          <i className="fas fa-circle-check" style={{ fontSize: "1.5rem", color: "var(--success-color)" }} />
          <span style={{ fontWeight: 600 }}>{value.name}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click para cambiar</span>
        </>
      ) : (
        <>
          <i className={icon} style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} />
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Arrastrá o hacé click</span>
        </>
      )}
    </div>
  );
}

// ── SKU chip ─────────────────────────────────────────────────────────
function SkuChip({ item, onRemove }: { item: SkuItem; onRemove?: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.3rem",
      background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
      borderRadius: "var(--radius)", padding: "0.2rem 0.45rem",
      fontSize: "0.75rem", fontFamily: "monospace",
    }}>
      <span style={{ fontWeight: 600 }}>
        {item.sku}{item.cantidad > 1 ? ` ×${item.cantidad}` : ""}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 0.1rem", fontSize: "0.7rem", lineHeight: 1 }}
        >
          <i className="fas fa-times" />
        </button>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function EtiquetasPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [csv, setCsv] = useState<FileState>(null);
  const [pdf, setPdf] = useState<FileState>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [done, setDone]               = useState(false);

  // Parsed orders (from CSV)
  const [parsedOrders, setParsedOrders] = useState<ParsedOrders | null>(null);
  const [parseLoading, setParseLoading] = useState(false);

  // Edit modal
  const [editModal, setEditModal] = useState<{ orden: string; nombre: string } | null>(null);
  const [editSkus, setEditSkus]   = useState<SkuItem[]>([]);
  const [nuevoSku, setNuevoSku]   = useState("");
  const [nuevaCant, setNuevaCant] = useState(1);

  // ── Parse CSV when uploaded ──
  async function handleCsvChange(f: FileState) {
    setCsv(f);
    setParsedOrders(null);
    setDone(false);
    if (!f) return;
    setParseLoading(true);
    try {
      const form = new FormData();
      form.append("csv", f.file);
      const res = await fetch("/api/etiquetas/parse", { method: "POST", body: form });
      if (res.ok) {
        const { orders } = await res.json();
        setParsedOrders(orders ?? null);
      } else {
        console.error("[etiquetas/parse] HTTP", res.status);
      }
    } catch (e) {
      console.error("[etiquetas/parse]", e);
    }
    setParseLoading(false);
  }

  // ── Edit modal helpers ──
  function openEdit(orden: string) {
    const info = parsedOrders?.[orden];
    if (!info) return;
    setEditSkus([...info.skus]);
    setNuevoSku("");
    setNuevaCant(1);
    setEditModal({ orden, nombre: info.nombre });
  }

  function addNuevoSku() {
    const s = nuevoSku.trim().toUpperCase();
    if (!s) return;
    setEditSkus(prev => [...prev, { sku: s, cantidad: Math.max(1, nuevaCant) }]);
    setNuevoSku("");
    setNuevaCant(1);
  }

  function saveEdit() {
    if (!editModal) return;
    setParsedOrders(prev => ({
      ...prev!,
      [editModal.orden]: { nombre: editModal.nombre, skus: [...editSkus] },
    }));
    setEditModal(null);
  }

  // ── Generate PDF ──
  async function handleProcess() {
    if (!pdf || !parsedOrders) return;
    setLoading(true);
    setError(null);
    setDone(false);

    try {
      // Build sku_map string from (possibly edited) parsedOrders
      const skuMapObj: Record<string, string> = {};
      for (const [orden, info] of Object.entries(parsedOrders)) {
        const parts = info.skus
          .filter(s => s.sku.trim())
          .map(s => s.cantidad > 1 ? `${s.sku} x${s.cantidad}` : s.sku);
        if (parts.length) skuMapObj[orden] = parts.join(" | ");
      }

      const form = new FormData();
      form.append("pdf", pdf.file);
      form.append("sku_map", JSON.stringify(skuMapObj));

      const res = await fetch("/api/etiquetas", { method: "POST", body: form });

      if (!res.ok) {
        let msg = `Error del servidor (HTTP ${res.status})`;
        try { msg = (await res.json()).error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;

      // Build filename with store name + date
      let storeName = "Tienda";
      try {
        const statusRes = await fetch("/api/auth/status");
        if (statusRes.ok) {
          const status = await statusRes.json();
          const activeStore = status.stores?.find((s: { user_id: number; store_name: string }) => s.user_id === status.active);
          if (activeStore?.store_name) storeName = activeStore.store_name;
        }
      } catch { /* use default */ }

      const hoy = new Date();
      const dd  = String(hoy.getDate()).padStart(2, "0");
      const mm  = String(hoy.getMonth() + 1).padStart(2, "0");
      const aa  = String(hoy.getFullYear()).slice(2);
      const nombreLimpio = storeName.replace(/[/\\:*?"<>|]/g, "_").trim();
      a.download = `etiquetas_sku_${nombreLimpio}_${dd}-${mm}-${aa}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const ready        = !!pdf && parsedOrders !== null && !parseLoading;
  const totalPedidos = parsedOrders ? Object.keys(parsedOrders).length : 0;
  const showTable    = (parsedOrders !== null && !parseLoading) || parseLoading;

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

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Agregar SKU a Etiquetas
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Agregá el SKU de cada pedido al pie del PDF de etiquetas de Andreani.
          </p>

          {/* ── PASO 1: Upload ── */}
          <div className="sf-section-title">
            <div className="sf-step-badge pending">1</div>
            <div>
              <h2>Subir archivos</h2>
              <p>ventas.csv de Tienda Nube y el PDF de paquetes de Andreani</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <DropZone
              label="ventas.csv"
              accept=".csv,text/csv"
              icon="fas fa-file-csv"
              value={csv}
              onChange={handleCsvChange}
            />
            <DropZone
              label="PDF de paquetes (Andreani)"
              accept=".pdf,application/pdf"
              icon="fas fa-file-pdf"
              value={pdf}
              onChange={(f) => { setPdf(f); setDone(false); }}
            />
          </div>

          {/* ── PASO 2: Preview & editar ── */}
          {showTable && (
            <>
              <div className="sf-section-title">
                <div className="sf-step-badge pending">2</div>
                <div>
                  <h2>Revisar y editar SKUs</h2>
                  <p>
                    {parseLoading
                      ? "Procesando CSV…"
                      : `${totalPedidos} pedido${totalPedidos !== 1 ? "s" : ""} con SKU — podés editar antes de generar`
                    }
                  </p>
                </div>
              </div>

              {parseLoading ? (
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", padding: "0.5rem 0 1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <i className="fas fa-spinner fa-spin" /> Leyendo pedidos…
                </div>
              ) : parsedOrders && (
                <div className="sf-table-wrap" style={{ marginBottom: "1.5rem" }}>
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th style={{ width: "9rem" }}>N° Orden</th>
                        <th>Cliente</th>
                        <th>SKUs</th>
                        <th style={{ width: "1px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(parsedOrders).map(([orden, info], i) => (
                        <tr key={orden} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                          <td>
                            <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.85rem" }}>
                              #{orden}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.85rem", color: info.nombre ? "var(--text-color)" : "var(--text-muted)" }}>
                            {info.nombre || "—"}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                              {info.skus.map((s, j) => (
                                <SkuChip key={j} item={s} />
                              ))}
                            </div>
                          </td>
                          <td>
                            <button
                              className="sf-btn-edit"
                              onClick={() => openEdit(orden)}
                              title="Editar SKUs"
                            >
                              <i className="fas fa-pen-to-square" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── PASO 3: Generar ── */}
          <div className="sf-section-title">
            <div className={`sf-step-badge ${done ? "" : "pending"}`}>
              {done
                ? <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                : showTable ? "3" : "2"
              }
            </div>
            <div>
              <h2>Generar etiquetas con SKU</h2>
              <p>Se descargará el PDF con el SKU al pie de cada etiqueta</p>
            </div>
          </div>

          {error && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="sf-alert sf-alert-ok" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
              <span>PDF generado y descargado correctamente.</span>
            </div>
          )}

          <button
            className="sf-btn"
            onClick={handleProcess}
            disabled={!ready || loading}
            style={{ opacity: ready && !loading ? 1 : 0.5, cursor: ready && !loading ? "pointer" : "not-allowed" }}
          >
            {loading
              ? <><i className="fas fa-spinner fa-spin" /> Procesando…</>
              : <><i className="fas fa-tags" /> Generar PDF con SKU</>
            }
          </button>

        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>

      {/* ── MODAL: Editar SKUs ── */}
      {editModal && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setEditModal(null)} />
          <div className="sf-modal" role="dialog" style={{ width: "min(500px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-tags" /> Editar SKUs — Orden #{editModal.orden}
              </h3>
              <button className="sf-close-btn" onClick={() => setEditModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="sf-modal-body">
              {editModal.nombre && (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  <i className="fas fa-user" style={{ marginRight: "0.4rem" }} />{editModal.nombre}
                </p>
              )}

              {/* Current SKUs */}
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                SKUs actuales
              </label>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1.25rem", minHeight: 34 }}>
                {editSkus.length === 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>Sin SKUs</span>
                )}
                {editSkus.map((s, i) => (
                  <SkuChip key={i} item={s} onRemove={() => setEditSkus(prev => prev.filter((_, idx) => idx !== i))} />
                ))}
              </div>

              {/* Add new SKU */}
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Agregar SKU
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  className="sf-input"
                  value={nuevoSku}
                  onChange={e => setNuevoSku(e.target.value.toUpperCase())}
                  placeholder="Ej: FAJA"
                  onKeyDown={e => e.key === "Enter" && addNuevoSku()}
                  style={{ flex: 3 }}
                  autoFocus
                />
                <input
                  type="number"
                  className="sf-input"
                  value={nuevaCant}
                  min={1}
                  onChange={e => setNuevaCant(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ flex: 1, minWidth: 65 }}
                  title="Cantidad"
                />
                <button className="sf-btn" onClick={addNuevoSku} style={{ flexShrink: 0, padding: "0.4rem 0.75rem" }}>
                  <i className="fas fa-plus" />
                </button>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                Presioná Enter o hacé click en + para agregar
              </p>
            </div>

            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="sf-btn" onClick={saveEdit}>
                <i className="fas fa-floppy-disk" /> Guardar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
