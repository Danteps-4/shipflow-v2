"use client";

import { useState, useEffect, useCallback } from "react";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

interface LineaCompra {
  id: number;
  sku: string;
  nombre: string;
  cantidad_esperada: number;
  cantidad_recibida: number;
  unidades_por_caja: number | null;
}

interface Compra {
  id: number;
  fecha_compra: string;
  tracking_number: string | null;
  fecha_llegada_estimada: string | null;
  fecha_llegada_real: string | null;
  dap: number | null;
  pague: number | null;
  precio_usd: number | null;
  declaro: number | null;
  impuestos: number | null;
  total_ars: number | null;
  nota: string;
  created_by: string;
  created_at: string;
  lineas: LineaCompra[];
}

interface StockItem {
  sku: string;
  nombre: string;
  cantidad: number;
}

interface LineaForm {
  sku: string;
  nombre: string;
  cantidadEsperada: string;
  unidadesPorCaja: string;
}

const LINEA_VACIA: LineaForm = { sku: "", nombre: "", cantidadEsperada: "", unidadesPorCaja: "" };

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function fmtMoneda(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export default function ImportacionesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StockItem[]>([]);

  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Modal alta
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fechaCompra: "", trackingNumber: "", fechaLlegadaEstimada: "",
    dap: "", pague: "", precioUsd: "", declaro: "", impuestos: "", totalArs: "", nota: "",
  });
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...LINEA_VACIA }]);
  const [activeSkuRow, setActiveSkuRow] = useState<number | null>(null);

  const fetchCompras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (soloPendientes) params.set("soloPendientes", "true");
      const res = await fetch(`/api/importaciones/compras?${params.toString()}`);
      if (res.status === 401 || res.status === 403) { setError("No tenés acceso a este módulo."); return; }
      if (!res.ok) throw new Error("Error al cargar");
      const { compras } = await res.json();
      setCompras(compras ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [q, desde, hasta, soloPendientes]);

  useEffect(() => { fetchCompras(); }, [fetchCompras]);

  useEffect(() => {
    fetch("/api/stock").then(r => r.ok ? r.json() : null).then(data => {
      if (data?.items) setItems(data.items);
    }).catch(() => {});
  }, []);

  function getSkuSuggestions(value: string): StockItem[] {
    const v = value.trim().toLowerCase();
    if (!v) return items.slice(0, 10);
    return items.filter(it => it.sku.toLowerCase().includes(v) || it.nombre.toLowerCase().includes(v)).slice(0, 8);
  }

  function openNuevo() {
    setForm({ fechaCompra: new Date().toISOString().slice(0, 10), trackingNumber: "", fechaLlegadaEstimada: "", dap: "", pague: "", precioUsd: "", declaro: "", impuestos: "", totalArs: "", nota: "" });
    setLineas([{ ...LINEA_VACIA }]);
    setFormError(null);
    setModalOpen(true);
  }

  function updateLinea(i: number, field: keyof LineaForm, value: string) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: field === "sku" ? value.toUpperCase() : value } : l));
  }

  function addLineaRow() { setLineas(prev => [...prev, { ...LINEA_VACIA }]); }
  function removeLineaRow(i: number) { setLineas(prev => prev.filter((_, idx) => idx !== i)); }

  function numOrNull(s: string): number | null {
    const n = parseFloat(s.replace(",", "."));
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    setFormError(null);
    if (!form.fechaCompra) {
      setFormError("Falta fecha de compra");
      return;
    }
    const lineasValidas = lineas.filter(l => l.sku.trim() && parseInt(l.cantidadEsperada) > 0);
    if (lineasValidas.length === 0) {
      setFormError("Agregá al menos un producto con cantidad");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/importaciones/compras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaCompra: form.fechaCompra, trackingNumber: form.trackingNumber.trim() || null,
          fechaLlegadaEstimada: form.fechaLlegadaEstimada || null,
          dap: numOrNull(form.dap), pague: numOrNull(form.pague), precioUsd: numOrNull(form.precioUsd),
          declaro: numOrNull(form.declaro), impuestos: numOrNull(form.impuestos), totalArs: numOrNull(form.totalArs),
          nota: form.nota,
          lineas: lineasValidas.map(l => ({
            sku: l.sku.trim(), nombre: l.nombre.trim() || undefined,
            cantidadEsperada: parseInt(l.cantidadEsperada), unidadesPorCaja: l.unidadesPorCaja ? parseInt(l.unidadesPorCaja) : null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setModalOpen(false);
      await fetchCompras();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/importaciones/compras/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Error al borrar");
      setCompras(prev => prev.filter(c => c.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al borrar");
    } finally {
      setDeleteConfirm(null);
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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Compras a China</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Registro de compras a proveedores: tracking, productos esperados por envío, y costos/aduana. La recepción física se confirma escaneando en{" "}
            <a href="/importaciones/recepcion" style={{ color: "var(--primary-color)" }}>Recepción (Escaneo)</a>.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
            <input className="sf-input" style={{ maxWidth: 200 }} placeholder="Buscar tracking..." value={q} onChange={e => setQ(e.target.value)} />
            <input className="sf-input" style={{ maxWidth: 150 }} type="date" value={desde} onChange={e => setDesde(e.target.value)} title="Desde" />
            <input className="sf-input" style={{ maxWidth: 150 }} type="date" value={hasta} onChange={e => setHasta(e.target.value)} title="Hasta" />
            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
              Solo pendientes
            </label>
            <button className="sf-btn" style={{ marginLeft: "auto" }} onClick={openNuevo}>
              <i className="fas fa-plus" /> Nueva compra
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
          ) : !error && compras.length === 0 ? (
            <div className="sf-empty">
              <i className="fas fa-ship sf-empty-icon" />
              <p style={{ fontWeight: 600, color: "var(--text-color)", marginBottom: "0.25rem" }}>No hay compras cargadas</p>
            </div>
          ) : (
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead>
                  <tr>
                    <th>Compra</th>
                    <th>Tracking</th>
                    <th>Productos</th>
                    <th>Llegada</th>
                    <th style={{ textAlign: "right" }}>Total ARS</th>
                    <th style={{ width: "1px" }} />
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c, i) => {
                    const completa = c.lineas.every(l => l.cantidad_recibida >= l.cantidad_esperada);
                    return (
                      <>
                        <tr key={c.id} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                          <td style={{ whiteSpace: "nowrap" }}>{fmtFecha(c.fecha_compra)}</td>
                          <td style={{ fontFamily: "monospace" }}>{c.tracking_number ?? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin tracking</span>}</td>
                          <td>
                            <button
                              onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                              style={{ background: "none", border: "none", color: "var(--primary-color)", cursor: "pointer", fontSize: "0.82rem" }}
                            >
                              {c.lineas.length} línea{c.lineas.length !== 1 ? "s" : ""}
                              {completa
                                ? <span className="sf-badge sf-badge-ok" style={{ marginLeft: "0.4rem" }}>Completa</span>
                                : <span className="sf-badge" style={{ marginLeft: "0.4rem", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>Pendiente</span>}
                              <i className={`fas fa-chevron-${expandedId === c.id ? "up" : "down"}`} style={{ marginLeft: "0.4rem", fontSize: "0.7rem" }} />
                            </button>
                          </td>
                          <td style={{ fontSize: "0.8rem" }}>
                            {c.fecha_llegada_real ? <span style={{ color: "var(--success-color)" }}>{fmtFecha(c.fecha_llegada_real)}</span>
                              : <span style={{ color: "var(--text-muted)" }}>Est. {fmtFecha(c.fecha_llegada_estimada)}</span>}
                          </td>
                          <td style={{ textAlign: "right" }}>{fmtMoneda(c.total_ars)}</td>
                          <td>
                            <button className="sf-btn-edit" onClick={() => setDeleteConfirm(c.id)} title="Borrar">
                              <i className="fas fa-trash" />
                            </button>
                          </td>
                        </tr>
                        {expandedId === c.id && (
                          <tr key={`${c.id}-detalle`} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                            <td colSpan={6} style={{ paddingTop: 0 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", paddingBottom: "0.75rem" }}>
                                {c.lineas.map(l => (
                                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.82rem" }}>
                                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{l.sku}</span>
                                    <span style={{ color: "var(--text-muted)" }}>{l.nombre}</span>
                                    <span style={{ marginLeft: "auto", fontWeight: 700, color: l.cantidad_recibida >= l.cantidad_esperada ? "var(--success-color)" : "#f59e0b" }}>
                                      {l.cantidad_recibida} / {l.cantidad_esperada}
                                    </span>
                                    {l.unidades_por_caja && <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>({l.unidades_por_caja}/caja)</span>}
                                  </div>
                                ))}
                                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                                  <span>DAP: {fmtMoneda(c.dap)}</span>
                                  <span>Pagué: {fmtMoneda(c.pague)}</span>
                                  <span>Precio USD: {fmtMoneda(c.precio_usd)}</span>
                                  <span>Declaro: {fmtMoneda(c.declaro)}</span>
                                  <span>Impuestos: {fmtMoneda(c.impuestos)}</span>
                                  {c.nota && <span>Nota: {c.nota}</span>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>

      {/* ── MODAL: NUEVA COMPRA ── */}
      {modalOpen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setModalOpen(false)} />
          <div className="sf-modal" role="dialog" style={{ width: "min(640px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title"><i className="fas fa-ship" /> Nueva compra</h3>
              <button className="sf-close-btn" onClick={() => setModalOpen(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              {formError && (
                <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
                  <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
                  <span>{formError}</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <Field label="Fecha de compra *">
                  <input type="date" className="sf-input" value={form.fechaCompra} onChange={e => setForm({ ...form, fechaCompra: e.target.value })} />
                </Field>
                <Field label="Tracking">
                  <input type="text" className="sf-input" value={form.trackingNumber} onChange={e => setForm({ ...form, trackingNumber: e.target.value })} placeholder="N° de seguimiento (opcional)" />
                </Field>
                <Field label="Llegada estimada">
                  <input type="date" className="sf-input" value={form.fechaLlegadaEstimada} onChange={e => setForm({ ...form, fechaLlegadaEstimada: e.target.value })} />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem", marginBottom: "1rem" }}>
                <Field label="DAP $"><input type="text" className="sf-input" value={form.dap} onChange={e => setForm({ ...form, dap: e.target.value })} /></Field>
                <Field label="Pagué"><input type="text" className="sf-input" value={form.pague} onChange={e => setForm({ ...form, pague: e.target.value })} /></Field>
                <Field label="Precio USD"><input type="text" className="sf-input" value={form.precioUsd} onChange={e => setForm({ ...form, precioUsd: e.target.value })} /></Field>
                <Field label="Declaro"><input type="text" className="sf-input" value={form.declaro} onChange={e => setForm({ ...form, declaro: e.target.value })} /></Field>
                <Field label="Impuestos"><input type="text" className="sf-input" value={form.impuestos} onChange={e => setForm({ ...form, impuestos: e.target.value })} /></Field>
                <Field label="Total ARS"><input type="text" className="sf-input" value={form.totalArs} onChange={e => setForm({ ...form, totalArs: e.target.value })} /></Field>
              </div>

              <Field label="Nota">
                <input type="text" className="sf-input" value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} placeholder="Opcional" />
              </Field>

              <h4 style={{ fontSize: "0.85rem", fontWeight: 700, margin: "1rem 0 0.5rem" }}>Productos esperados</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {lineas.map((linea, i) => {
                  const suggestions = getSkuSuggestions(linea.sku);
                  return (
                    <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                      <div style={{ flex: 2, position: "relative" }}>
                        <input
                          type="text" className="sf-input" placeholder="SKU"
                          value={linea.sku}
                          onChange={e => { updateLinea(i, "sku", e.target.value); setActiveSkuRow(i); }}
                          onFocus={() => setActiveSkuRow(i)}
                          onBlur={() => setTimeout(() => setActiveSkuRow(null), 160)}
                          autoComplete="off"
                          style={{ width: "100%" }}
                        />
                        {activeSkuRow === i && suggestions.length > 0 && (
                          <div style={{
                            position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 200,
                            background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius)", maxHeight: 180, overflowY: "auto", boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
                          }}>
                            {suggestions.map(it => (
                              <button key={it.sku} type="button"
                                onMouseDown={() => { updateLinea(i, "sku", it.sku); updateLinea(i, "nombre", it.nombre); setActiveSkuRow(null); }}
                                style={{ display: "flex", width: "100%", textAlign: "left", padding: "0.4rem 0.7rem", background: "none", border: "none", color: "var(--text-color)", cursor: "pointer", fontSize: "0.8rem", gap: "0.5rem" }}
                              >
                                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{it.sku}</span>
                                <span style={{ color: "var(--text-muted)" }}>{it.nombre}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input type="text" className="sf-input" placeholder="Nombre (si es nuevo)" value={linea.nombre}
                        onChange={e => updateLinea(i, "nombre", e.target.value)} style={{ flex: 2 }} />
                      <input type="number" className="sf-input" placeholder="Cant." value={linea.cantidadEsperada}
                        onChange={e => updateLinea(i, "cantidadEsperada", e.target.value)} style={{ flex: 1, minWidth: 70 }} />
                      <input type="number" className="sf-input" placeholder="U/caja" value={linea.unidadesPorCaja}
                        onChange={e => updateLinea(i, "unidadesPorCaja", e.target.value)} style={{ flex: 1, minWidth: 70 }} title="Unidades por caja (opcional)" />
                      <button onClick={() => removeLineaRow(i)} style={{ background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius)", padding: "0.4rem 0.6rem", color: "var(--error-color)", cursor: "pointer" }}>
                        <i className="fas fa-xmark" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button onClick={addLineaRow} style={{ marginTop: "0.6rem", background: "none", border: "1px dashed var(--border-color)", borderRadius: "var(--radius)", padding: "0.4rem 0.75rem", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", width: "100%" }}>
                <i className="fas fa-plus" style={{ marginRight: "0.35rem" }} /> Agregar producto
              </button>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="sf-btn" onClick={handleSave} disabled={saving}>
                {saving ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-floppy-disk" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── CONFIRMAR BORRADO ── */}
      {deleteConfirm !== null && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setDeleteConfirm(null)} />
          <div className="sf-modal" role="dialog" style={{ width: "min(380px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">¿Borrar esta compra?</h3>
              <button className="sf-close-btn" onClick={() => setDeleteConfirm(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No se puede deshacer. Si ya tiene cajas recibidas, no se va a poder borrar.</p>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="sf-btn" style={{ background: "var(--error-color)" }} onClick={() => handleDelete(deleteConfirm)}>Borrar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.3px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
