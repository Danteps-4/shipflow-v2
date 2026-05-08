"use client";

import { useState, useEffect, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";

interface StockItem {
  sku: string;
  nombre: string;
  cantidad: number;
  updated_at: string;
}

interface Movimiento {
  id: number;
  sku: string;
  cantidad: number;
  motivo: string;
  created_at: string;
}

type Tab = "stock" | "movimientos";

const SIDEBAR_NAV = [
  { href: "/",          icon: "fas fa-house",        label: "Inicio" },
  { href: "/orders",    icon: "fas fa-receipt",       label: "Pedidos" },
  { href: "/procesar",  icon: "fas fa-file-excel",    label: "Procesar Pedidos" },
  { href: "/etiquetas", icon: "fas fa-tags",           label: "Agregar SKU a Etiquetas" },
  { href: "/tracking",  icon: "fas fa-truck",          label: "Subir Tracking" },
  { href: "/stock",     icon: "fas fa-boxes-stacking", label: "Stock de Productos" },
];

export default function StockPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab]                 = useState<Tab>("stock");

  // Stock
  const [items, setItems]       = useState<StockItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  // Modal agregar / editar
  const [modal, setModal]       = useState<{ sku: string; nombre: string; cantidad: number } | null>(null);
  const [isNew, setIsNew]       = useState(false);
  const [saving, setSaving]     = useState(false);

  // Modal ajuste (+/-)
  const [ajusteModal, setAjusteModal] = useState<{ sku: string; nombre: string } | null>(null);
  const [ajusteDelta, setAjusteDelta] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [ajustando, setAjustando] = useState(false);

  // Movimientos
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [movLoading, setMovLoading]   = useState(false);

  const skuInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchStock(); }, []);
  useEffect(() => {
    if (tab === "movimientos" && movimientos.length === 0) fetchMovimientos();
  }, [tab]);

  async function fetchStock() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stock");
      if (r.status === 401) { setError("Conectate a Tienda Nube para usar el stock."); return; }
      if (!r.ok) throw new Error("Error al cargar stock");
      const { items: data } = await r.json();
      setItems(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMovimientos() {
    setMovLoading(true);
    try {
      const r = await fetch("/api/stock/movimientos");
      if (!r.ok) throw new Error();
      const { movimientos: data } = await r.json();
      setMovimientos(data);
    } finally {
      setMovLoading(false);
    }
  }

  function openNew() {
    setModal({ sku: "", nombre: "", cantidad: 0 });
    setIsNew(true);
    setTimeout(() => skuInputRef.current?.focus(), 50);
  }

  function openEdit(item: StockItem) {
    setModal({ sku: item.sku, nombre: item.nombre, cantidad: item.cantidad });
    setIsNew(false);
  }

  async function handleSave() {
    if (!modal) return;
    if (!modal.sku.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: modal.sku.trim().toUpperCase(), nombre: modal.nombre.trim(), cantidad: modal.cantidad }),
      });
      if (!r.ok) throw new Error();
      setModal(null);
      await fetchStock();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sku: string) {
    if (!confirm(`¿Eliminar el SKU "${sku}" del stock?`)) return;
    await fetch(`/api/stock?sku=${encodeURIComponent(sku)}`, { method: "DELETE" });
    await fetchStock();
  }

  async function handleAjuste() {
    if (!ajusteModal) return;
    const delta = parseInt(ajusteDelta);
    if (isNaN(delta) || delta === 0) return;
    setAjustando(true);
    try {
      await fetch("/api/stock/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: ajusteModal.sku,
          nombre: ajusteModal.nombre,
          delta,
          motivo: ajusteMotivo.trim() || (delta > 0 ? "Carga manual" : "Descuento manual"),
        }),
      });
      setAjusteModal(null);
      setAjusteDelta("");
      setAjusteMotivo("");
      await fetchStock();
      if (tab === "movimientos") await fetchMovimientos();
    } finally {
      setAjustando(false);
    }
  }

  const filtered = items.filter(
    i => i.sku.toLowerCase().includes(search.toLowerCase()) ||
         i.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);
  const sinStock      = items.filter(i => i.cantidad <= 0).length;

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── SIDEBAR ── */}
      <div className={`sf-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sf-sidebar-header">
          <h3>Menú</h3>
          <button className="sf-close-btn" onClick={() => setSidebarOpen(false)}>
            <i className="fas fa-times" />
          </button>
        </div>
        <nav className="sf-nav">
          {SIDEBAR_NAV.map(n => (
            <a key={n.href} href={n.href} className={n.href === "/stock" ? "active" : ""}>
              <i className={n.icon} /> {n.label}
            </a>
          ))}
        </nav>
      </div>
      <div className={`sf-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* ── HEADER ── */}
      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StoreSwitcher /><UserMenu />
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="sf-main">
        <div className="sf-container">

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Stock de Productos
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Controlá las cantidades disponibles. El stock se descuenta automáticamente al exportar pedidos.
          </p>

          {/* Tarjetas resumen */}
          {!loading && !error && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <StatCard value={items.length}  label="SKUs cargados"    icon="fas fa-boxes-stacking" color="var(--primary-color)" />
              <StatCard value={totalUnidades} label="Unidades totales" icon="fas fa-layer-group"     color="var(--success-color)" />
              <StatCard value={sinStock}      label="Sin stock"        icon="fas fa-triangle-exclamation" color={sinStock > 0 ? "var(--error-color)" : "var(--text-muted)"} />
            </div>
          )}

          {/* Error de autenticación */}
          {error && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
              <span>{error} <a href="/api/auth/login" style={{ color: "var(--primary-color)", fontWeight: 600 }}>Conectar Tienda Nube →</a></span>
            </div>
          )}

          {/* Tabs */}
          <div className="sf-tabs" style={{ marginBottom: "1rem" }}>
            <button className={`sf-tab ${tab === "stock" ? "active" : ""}`} onClick={() => setTab("stock")}>
              <i className="fas fa-boxes-stacking" /> Stock actual
              {items.length > 0 && <span className="sf-tab-badge">{items.length}</span>}
            </button>
            <button className={`sf-tab ${tab === "movimientos" ? "active" : ""}`} onClick={() => setTab("movimientos")}>
              <i className="fas fa-clock-rotate-left" /> Movimientos
            </button>
          </div>

          {/* ── TAB STOCK ── */}
          {tab === "stock" && (
            <>
              {/* Toolbar */}
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <input
                  type="search"
                  placeholder="Buscar SKU o nombre..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    flex: 1, minWidth: 180,
                    background: "var(--input-bg)", border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius)", padding: "0.5rem 0.75rem",
                    color: "var(--text-color)", fontSize: "0.875rem",
                  }}
                />
                <button className="sf-btn" onClick={openNew}>
                  <i className="fas fa-plus" /> Agregar SKU
                </button>
              </div>

              {loading && (
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.5rem" }} />Cargando stock...
                </div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div className="sf-empty">
                  <i className="fas fa-boxes-stacking sf-empty-icon" />
                  <p style={{ fontWeight: 600, color: "var(--text-color)", marginBottom: "0.25rem" }}>
                    {search ? "No se encontraron resultados" : "No hay productos cargados"}
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    {search ? "Probá con otra búsqueda." : "Hacé click en \"Agregar SKU\" para empezar."}
                  </p>
                </div>
              )}

              {!loading && filtered.length > 0 && (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Nombre del producto</th>
                        <th style={{ textAlign: "right" }}>Disponible</th>
                        <th>Actualizado</th>
                        <th style={{ width: "1px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item, i) => (
                        <tr key={item.sku} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                          <td>
                            <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{item.sku}</span>
                          </td>
                          <td>{item.nombre || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin nombre</span>}</td>
                          <td style={{ textAlign: "right" }}>
                            <span style={{
                              fontWeight: 700,
                              color: item.cantidad <= 0 ? "var(--error-color)" : item.cantidad <= 5 ? "#f59e0b" : "var(--success-color)",
                              fontSize: "1rem",
                            }}>
                              {item.cantidad}
                            </span>
                            {item.cantidad <= 0 && (
                              <span className="sf-badge sf-badge-error" style={{ marginLeft: "0.5rem", fontSize: "0.65rem" }}>Sin stock</span>
                            )}
                            {item.cantidad > 0 && item.cantidad <= 5 && (
                              <span className="sf-badge" style={{ marginLeft: "0.5rem", fontSize: "0.65rem", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>Poco stock</span>
                            )}
                          </td>
                          <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{fmtDate(item.updated_at)}</td>
                          <td>
                            <div style={{ display: "flex", gap: "0.4rem", whiteSpace: "nowrap" }}>
                              <button
                                className="sf-btn-edit"
                                onClick={() => { setAjusteModal({ sku: item.sku, nombre: item.nombre }); setAjusteDelta(""); setAjusteMotivo(""); }}
                                title="Ajustar cantidad"
                              >
                                <i className="fas fa-plus-minus" /> Ajustar
                              </button>
                              <button
                                className="sf-btn-edit"
                                onClick={() => openEdit(item)}
                                title="Editar"
                              >
                                <i className="fas fa-pen-to-square" /> Editar
                              </button>
                              <button
                                onClick={() => handleDelete(item.sku)}
                                style={{
                                  background: "none", border: "1px solid rgba(239,68,68,0.3)",
                                  borderRadius: "var(--radius)", padding: "0.3rem 0.6rem",
                                  color: "var(--error-color)", cursor: "pointer", fontSize: "0.75rem",
                                }}
                                title="Eliminar"
                              >
                                <i className="fas fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── TAB MOVIMIENTOS ── */}
          {tab === "movimientos" && (
            <>
              {movLoading && (
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.5rem" }} />Cargando historial...
                </div>
              )}

              {!movLoading && movimientos.length === 0 && (
                <div className="sf-empty">
                  <i className="fas fa-clock-rotate-left sf-empty-icon" />
                  <p style={{ fontWeight: 600, color: "var(--text-color)", marginBottom: "0.25rem" }}>Sin movimientos</p>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Los movimientos aparecen al exportar pedidos o hacer ajustes manuales.
                  </p>
                </div>
              )}

              {!movLoading && movimientos.length > 0 && (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>SKU</th>
                        <th style={{ textAlign: "right" }}>Cantidad</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((m, i) => (
                        <tr key={m.id} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(m.created_at)}</td>
                          <td><span style={{ fontFamily: "monospace", fontWeight: 600 }}>{m.sku}</span></td>
                          <td style={{ textAlign: "right" }}>
                            <span style={{
                              fontWeight: 700,
                              color: m.cantidad >= 0 ? "var(--success-color)" : "var(--error-color)",
                            }}>
                              {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.83rem", color: "var(--text-muted)" }}>{m.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>

      {/* ── MODAL: AGREGAR / EDITAR ── */}
      {modal && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setModal(null)} />
          <div className="sf-modal" role="dialog" style={{ width: "min(420px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className={isNew ? "fas fa-plus" : "fas fa-pen-to-square"} />
                {isNew ? "Agregar SKU" : `Editar ${modal.sku}`}
              </h3>
              <button className="sf-close-btn" onClick={() => setModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Field label="SKU *">
                  <input
                    ref={skuInputRef}
                    type="text"
                    className="sf-input"
                    value={modal.sku}
                    onChange={e => setModal({ ...modal, sku: e.target.value.toUpperCase() })}
                    placeholder="Ej: CAM-001"
                    disabled={!isNew}
                    style={{ opacity: !isNew ? 0.6 : 1 }}
                  />
                </Field>
                <Field label="Nombre del producto">
                  <input
                    type="text"
                    className="sf-input"
                    value={modal.nombre}
                    onChange={e => setModal({ ...modal, nombre: e.target.value })}
                    placeholder="Ej: Remera básica azul"
                  />
                </Field>
                <Field label="Cantidad disponible *">
                  <input
                    type="number"
                    className="sf-input"
                    value={modal.cantidad}
                    onChange={e => setModal({ ...modal, cantidad: parseInt(e.target.value) || 0 })}
                    min={0}
                  />
                </Field>
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="sf-btn" onClick={handleSave} disabled={saving || !modal.sku.trim()}>
                {saving ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-floppy-disk" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL: AJUSTE ── */}
      {ajusteModal && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setAjusteModal(null)} />
          <div className="sf-modal" role="dialog" style={{ width: "min(380px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-plus-minus" /> Ajustar stock — {ajusteModal.sku}
              </h3>
              <button className="sf-close-btn" onClick={() => setAjusteModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Field label="Cantidad (+/−)">
                  <input
                    type="number"
                    className="sf-input"
                    value={ajusteDelta}
                    onChange={e => setAjusteDelta(e.target.value)}
                    placeholder="Ej: +50 o -3"
                    autoFocus
                  />
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Positivo para sumar stock, negativo para restar.
                  </p>
                </Field>
                <Field label="Motivo (opcional)">
                  <input
                    type="text"
                    className="sf-input"
                    value={ajusteMotivo}
                    onChange={e => setAjusteMotivo(e.target.value)}
                    placeholder="Ej: Reposición de mercadería"
                  />
                </Field>
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setAjusteModal(null)}>Cancelar</button>
              <button className="sf-btn" onClick={handleAjuste} disabled={ajustando || !ajusteDelta || parseInt(ajusteDelta) === 0}>
                {ajustando ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-floppy-disk" /> Aplicar ajuste</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ value, label, icon, color }: { value: number; label: string; icon: string; color: string }) {
  return (
    <div style={{
      background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)",
      borderRadius: "var(--radius)", padding: "0.875rem 1rem",
      display: "flex", alignItems: "center", gap: "0.75rem",
    }}>
      <i className={icon} style={{ color, fontSize: "1.25rem", width: 24, textAlign: "center" }} />
      <div>
        <div style={{ fontSize: "1.5rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: "0.2rem" }}>{label}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
