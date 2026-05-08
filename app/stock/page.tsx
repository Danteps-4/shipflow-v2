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

interface KitComponent {
  component_sku: string;
  cantidad: number;
}

interface KitMap {
  [kitSku: string]: KitComponent[];
}

type Tab = "stock" | "movimientos";

export default function StockPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab]                 = useState<Tab>("stock");

  const [items, setItems]       = useState<StockItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [kits, setKits]         = useState<KitMap>({});

  // Modal agregar / editar
  const [modal, setModal]       = useState<{ sku: string; nombre: string; cantidad: number } | null>(null);
  const [isNew, setIsNew]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const skuInputRef             = useRef<HTMLInputElement>(null);

  // Modal ajuste
  const [ajusteModal, setAjusteModal]   = useState<{ sku: string; nombre: string } | null>(null);
  const [ajusteDelta, setAjusteDelta]   = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [ajustando, setAjustando]       = useState(false);

  // Modal kit
  const [kitModal, setKitModal]           = useState<{ sku: string; nombre: string } | null>(null);
  const [kitComponents, setKitComponents] = useState<KitComponent[]>([]);
  const [savingKit, setSavingKit]         = useState(false);
  const [activeSkuRow, setActiveSkuRow]   = useState<number | null>(null);

  // Movimientos
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [movLoading, setMovLoading]   = useState(false);

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    if (tab === "movimientos" && movimientos.length === 0) fetchMovimientos();
  }, [tab]);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [rStock, rKits] = await Promise.all([
        fetch("/api/stock"),
        fetch("/api/stock/kits"),
      ]);
      if (rStock.status === 401) { setError("Conectate a Tienda Nube para usar el stock."); return; }
      if (!rStock.ok) throw new Error("Error al cargar stock");
      const { items: data } = await rStock.json();
      setItems(data);
      if (rKits.ok) {
        const { kits: kData } = await rKits.json();
        setKits(kData ?? {});
      }
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

  // ── CRUD stock ────────────────────────────────────────────────────────────

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
    if (!modal || !modal.sku.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: modal.sku.trim().toUpperCase(), nombre: modal.nombre.trim(), cantidad: modal.cantidad }),
      });
      setModal(null);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sku: string) {
    if (!confirm(`¿Eliminar "${sku}" del stock?`)) return;
    await fetch(`/api/stock?sku=${encodeURIComponent(sku)}`, { method: "DELETE" });
    await fetchAll();
  }

  // ── Ajuste manual ─────────────────────────────────────────────────────────

  async function handleAjuste() {
    if (!ajusteModal) return;
    const delta = parseInt(ajusteDelta);
    if (isNaN(delta) || delta === 0) return;
    setAjustando(true);
    try {
      const motivo = ajusteMotivo.trim() || (delta > 0 ? "Carga manual" : "Descuento manual");
      const esKit  = !!kits[ajusteModal.sku];

      if (esKit) {
        // Ajustar el kit mismo + cada componente por delta × su cantidad en la receta
        const comps = kits[ajusteModal.sku];
        await Promise.all([
          fetch("/api/stock/movimientos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sku: ajusteModal.sku, nombre: ajusteModal.nombre, delta, motivo }),
          }),
          ...comps.map(comp => {
            const nombre = items.find(x => x.sku === comp.component_sku)?.nombre ?? comp.component_sku;
            return fetch("/api/stock/movimientos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sku:    comp.component_sku,
                nombre,
                delta:  delta * comp.cantidad,
                motivo: `${motivo} (kit ${ajusteModal.sku})`,
              }),
            });
          }),
        ]);
      } else {
        await fetch("/api/stock/movimientos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sku: ajusteModal.sku, nombre: ajusteModal.nombre, delta, motivo }),
        });
      }

      setAjusteModal(null);
      setAjusteDelta("");
      setAjusteMotivo("");
      await fetchAll();
      if (tab === "movimientos") await fetchMovimientos();
    } finally {
      setAjustando(false);
    }
  }

  // ── Kits ──────────────────────────────────────────────────────────────────

  function getSkuSuggestions(value: string): StockItem[] {
    const v = value.trim().toLowerCase();
    if (!v) return items.slice(0, 10);
    return items.filter(it =>
      it.sku.toLowerCase().includes(v) || it.nombre.toLowerCase().includes(v)
    ).slice(0, 8);
  }

  function openKitModal(item: StockItem) {
    const existing = kits[item.sku] ?? [];
    setKitComponents(existing.length > 0 ? existing : [{ component_sku: "", cantidad: 1 }]);
    setKitModal({ sku: item.sku, nombre: item.nombre });
  }

  function addKitRow() {
    setKitComponents(prev => [...prev, { component_sku: "", cantidad: 1 }]);
  }

  function removeKitRow(i: number) {
    setKitComponents(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateKitRow(i: number, field: keyof KitComponent, value: string | number) {
    setKitComponents(prev => prev.map((c, idx) =>
      idx === i ? { ...c, [field]: field === "cantidad" ? Number(value) : String(value).toUpperCase() } : c
    ));
  }

  async function handleSaveKit() {
    if (!kitModal) return;
    setSavingKit(true);
    try {
      const validComponents = kitComponents.filter(c => c.component_sku.trim() && c.cantidad > 0);
      await fetch("/api/stock/kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitSku: kitModal.sku, components: validComponents }),
      });
      setKitModal(null);
      await fetchAll();
    } finally {
      setSavingKit(false);
    }
  }

  async function handleDeleteKit(sku: string) {
    await fetch(`/api/stock/kits?sku=${encodeURIComponent(sku)}`, { method: "DELETE" });
    await fetchAll();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const filtered = items.filter(
    i => i.sku.toLowerCase().includes(search.toLowerCase()) ||
         i.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);
  const sinStock      = items.filter(i => i.cantidad <= 0).length;
  const totalKits     = Object.keys(kits).length;

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
          <a href="/"><i className="fas fa-house" /> Inicio</a>
          <a href="/orders"><i className="fas fa-receipt" /> Pedidos</a>
          <a href="/procesar"><i className="fas fa-file-excel" /> Procesar Pedidos</a>
          <a href="/etiquetas"><i className="fas fa-tags" /> Agregar SKU a Etiquetas</a>
          <a href="/tracking"><i className="fas fa-truck" /> Subir Tracking</a>
          <a href="/stock" className="active"><i className="fas fa-boxes-stacking" /> Stock de Productos</a>
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
            Stock por tienda. Se descuenta automáticamente al exportar pedidos. Los kits descontán sus componentes.
          </p>

          {/* Tarjetas */}
          {!loading && !error && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <StatCard value={items.length}  label="SKUs cargados"    icon="fas fa-boxes-stacking"      color="var(--primary-color)" />
              <StatCard value={totalUnidades} label="Unidades totales" icon="fas fa-layer-group"          color="var(--success-color)" />
              <StatCard value={totalKits}     label="Kits definidos"   icon="fas fa-cubes"                color="#a78bfa" />
              <StatCard value={sinStock}      label="Sin stock"        icon="fas fa-triangle-exclamation" color={sinStock > 0 ? "var(--error-color)" : "var(--text-muted)"} />
            </div>
          )}

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

              {/* Leyenda kits */}
              {totalKits > 0 && (
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span className="sf-badge" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)", fontSize: "0.65rem" }}>
                    <i className="fas fa-cubes" /> Kit
                  </span>
                  = producto que descuenta sus componentes al exportar
                </div>
              )}

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
                        <th>Nombre</th>
                        <th style={{ textAlign: "right" }}>Disponible</th>
                        <th>Actualizado</th>
                        <th style={{ width: "1px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item, i) => {
                        const esKit    = !!kits[item.sku];
                        const comps    = kits[item.sku] ?? [];
                        return (
                          <>
                            <tr key={item.sku} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{item.sku}</span>
                                  {esKit && (
                                    <span className="sf-badge" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)", fontSize: "0.6rem" }}>
                                      <i className="fas fa-cubes" /> Kit
                                    </span>
                                  )}
                                </div>
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
                                  <span className="sf-badge sf-badge-error" style={{ marginLeft: "0.4rem", fontSize: "0.6rem" }}>Sin stock</span>
                                )}
                                {item.cantidad > 0 && item.cantidad <= 5 && (
                                  <span className="sf-badge" style={{ marginLeft: "0.4rem", fontSize: "0.6rem", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>Poco</span>
                                )}
                                {esKit && (
                                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "0.1rem" }}>ver componentes ↓</div>
                                )}
                              </td>
                              <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{fmtDate(item.updated_at)}</td>
                              <td>
                                <div style={{ display: "flex", gap: "0.35rem", whiteSpace: "nowrap" }}>
                                  <button
                                    className="sf-btn-edit"
                                    onClick={() => { setAjusteModal({ sku: item.sku, nombre: item.nombre }); setAjusteDelta(""); setAjusteMotivo(""); }}
                                    title="Ajustar cantidad"
                                  >
                                    <i className="fas fa-plus-minus" />
                                  </button>
                                  <button className="sf-btn-edit" onClick={() => openEdit(item)} title="Editar">
                                    <i className="fas fa-pen-to-square" />
                                  </button>
                                  <button
                                    className="sf-btn-edit"
                                    onClick={() => openKitModal(item)}
                                    title={esKit ? "Editar kit" : "Definir como kit"}
                                    style={{ color: esKit ? "#a78bfa" : undefined }}
                                  >
                                    <i className="fas fa-cubes" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(item.sku)}
                                    style={{
                                      background: "none", border: "1px solid rgba(239,68,68,0.3)",
                                      borderRadius: "var(--radius)", padding: "0.3rem 0.5rem",
                                      color: "var(--error-color)", cursor: "pointer", fontSize: "0.75rem",
                                    }}
                                    title="Eliminar"
                                  >
                                    <i className="fas fa-trash" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {/* Fila expandida con componentes del kit */}
                            {esKit && (
                              <tr key={`${item.sku}-kit`} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                                <td colSpan={5} style={{ paddingTop: 0, paddingLeft: "2rem" }}>
                                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", paddingBottom: "0.5rem" }}>
                                    {comps.map(c => {
                                      const compItem = items.find(x => x.sku === c.component_sku);
                                      const cantDisp = compItem?.cantidad ?? null;
                                      return (
                                        <div key={c.component_sku} style={{
                                          background: "rgba(167,139,250,0.08)",
                                          border: "1px solid rgba(167,139,250,0.25)",
                                          borderRadius: "var(--radius)",
                                          padding: "0.3rem 0.6rem",
                                          fontSize: "0.75rem",
                                          display: "flex", alignItems: "center", gap: "0.4rem",
                                        }}>
                                          <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{c.component_sku}</span>
                                          <span style={{ color: "var(--text-muted)" }}>×{c.cantidad}</span>
                                          {cantDisp !== null && (
                                            <span style={{ color: cantDisp <= 0 ? "var(--error-color)" : "var(--success-color)", fontWeight: 600 }}>
                                              ({cantDisp} disponibles)
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                    <button
                                      onClick={() => handleDeleteKit(item.sku)}
                                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.72rem", padding: "0.2rem 0.4rem" }}
                                      title="Quitar definición de kit"
                                    >
                                      <i className="fas fa-xmark" /> Quitar kit
                                    </button>
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
                            <span style={{ fontWeight: 700, color: m.cantidad >= 0 ? "var(--success-color)" : "var(--error-color)" }}>
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
              <button className="sf-close-btn" onClick={() => setModal(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Field label="SKU *">
                  <input ref={skuInputRef} type="text" className="sf-input"
                    value={modal.sku}
                    onChange={e => setModal({ ...modal, sku: e.target.value.toUpperCase() })}
                    placeholder="Ej: ADAPT-BLANCO"
                    disabled={!isNew}
                    style={{ opacity: !isNew ? 0.6 : 1 }}
                  />
                </Field>
                <Field label="Nombre del producto">
                  <input type="text" className="sf-input"
                    value={modal.nombre}
                    onChange={e => setModal({ ...modal, nombre: e.target.value })}
                    placeholder="Ej: Adaptador blanco"
                  />
                </Field>
                <Field label="Cantidad disponible *">
                  <input type="number" className="sf-input"
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
          <div className="sf-modal" role="dialog" style={{ width: "min(400px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-plus-minus" /> Ajustar — {ajusteModal.sku}
              </h3>
              <button className="sf-close-btn" onClick={() => setAjusteModal(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              {kits[ajusteModal.sku] && (
                <div style={{
                  marginBottom: "1rem", padding: "0.6rem 0.875rem",
                  background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)",
                  borderRadius: "var(--radius)", fontSize: "0.78rem", color: "var(--text-muted)",
                }}>
                  <i className="fas fa-cubes" style={{ marginRight: "0.4rem", color: "#a78bfa" }} />
                  <strong style={{ color: "#a78bfa" }}>Kit:</strong> el ajuste se aplica a los componentes, no al kit en sí.
                  {kits[ajusteModal.sku].map(c => (
                    <span key={c.component_sku} style={{ display: "inline-block", marginLeft: "0.5rem", fontFamily: "monospace" }}>
                      {c.component_sku} ×{c.cantidad}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Field label="Cantidad (+/−)">
                  <input type="number" className="sf-input" value={ajusteDelta} autoFocus
                    onChange={e => setAjusteDelta(e.target.value)}
                    placeholder="Ej: +50 para sumar, -3 para restar"
                  />
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Positivo para sumar, negativo para restar.
                  </p>
                </Field>
                <Field label="Motivo (opcional)">
                  <input type="text" className="sf-input" value={ajusteMotivo}
                    onChange={e => setAjusteMotivo(e.target.value)}
                    placeholder="Ej: Reposición de mercadería"
                  />
                </Field>
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setAjusteModal(null)}>Cancelar</button>
              <button className="sf-btn" onClick={handleAjuste} disabled={ajustando || !ajusteDelta || parseInt(ajusteDelta) === 0}>
                {ajustando ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-floppy-disk" /> Aplicar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL: KIT ── */}
      {kitModal && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setKitModal(null)} />
          <div className="sf-modal" role="dialog" style={{ width: "min(520px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-cubes" style={{ color: "#a78bfa" }} /> Definir kit — {kitModal.sku}
              </h3>
              <button className="sf-close-btn" onClick={() => setKitModal(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Cuando se venda <strong>{kitModal.nombre || kitModal.sku}</strong>, en lugar de descontar este SKU del stock, se descontarán los siguientes componentes:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {kitComponents.map((comp, i) => {
                  const suggestions = getSkuSuggestions(comp.component_sku);
                  return (
                    <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                      {/* SKU con autocomplete */}
                      <div style={{ flex: 2, position: "relative" }}>
                        <input
                          type="text"
                          className="sf-input"
                          value={comp.component_sku}
                          onChange={e => { updateKitRow(i, "component_sku", e.target.value); setActiveSkuRow(i); }}
                          onFocus={() => setActiveSkuRow(i)}
                          onBlur={() => setTimeout(() => setActiveSkuRow(null), 160)}
                          placeholder="SKU del componente"
                          style={{ width: "100%" }}
                          autoComplete="off"
                        />
                        {activeSkuRow === i && suggestions.length > 0 && (
                          <div style={{
                            position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 200,
                            background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius)", maxHeight: 200, overflowY: "auto",
                            boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
                          }}>
                            {suggestions.map(it => (
                              <button
                                key={it.sku}
                                type="button"
                                onMouseDown={() => { updateKitRow(i, "component_sku", it.sku); setActiveSkuRow(null); }}
                                style={{
                                  display: "flex", width: "100%", textAlign: "left", alignItems: "center",
                                  padding: "0.45rem 0.75rem", background: "none", border: "none",
                                  color: "var(--text-color)", cursor: "pointer", fontSize: "0.82rem",
                                  borderBottom: "1px solid rgba(255,255,255,0.05)", gap: "0.5rem",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "none")}
                              >
                                <span style={{ fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>{it.sku}</span>
                                {it.nombre && <span style={{ color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nombre}</span>}
                                <span style={{ marginLeft: "auto", fontWeight: 700, flexShrink: 0, color: it.cantidad <= 0 ? "var(--error-color)" : it.cantidad <= 5 ? "#f59e0b" : "var(--success-color)" }}>
                                  {it.cantidad} uds.
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        className="sf-input"
                        value={comp.cantidad}
                        min={1}
                        onChange={e => updateKitRow(i, "cantidad", e.target.value)}
                        style={{ flex: 1, minWidth: 70 }}
                        title="Cantidad"
                      />
                      <button
                        onClick={() => removeKitRow(i)}
                        style={{
                          background: "none", border: "1px solid rgba(239,68,68,0.3)",
                          borderRadius: "var(--radius)", padding: "0.4rem 0.6rem",
                          color: "var(--error-color)", cursor: "pointer", fontSize: "0.8rem", flexShrink: 0,
                          marginTop: "1px",
                        }}
                      >
                        <i className="fas fa-xmark" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={addKitRow}
                style={{
                  marginTop: "0.75rem", background: "none",
                  border: "1px dashed var(--border-color)", borderRadius: "var(--radius)",
                  padding: "0.4rem 0.75rem", color: "var(--text-muted)",
                  cursor: "pointer", fontSize: "0.8rem", width: "100%",
                }}
              >
                <i className="fas fa-plus" style={{ marginRight: "0.35rem" }} />
                Agregar componente
              </button>

              <div style={{
                marginTop: "1rem", padding: "0.65rem 0.875rem",
                background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)",
                borderRadius: "var(--radius)", fontSize: "0.78rem", color: "var(--text-muted)",
              }}>
                <i className="fas fa-circle-info" style={{ marginRight: "0.4rem", color: "#a78bfa" }} />
                <strong>Ejemplo:</strong> Si el kit tiene 1× ADAPT-BLANCO y 1× ADAPT-NEGRO, al exportar 2 pedidos de este kit se descontarán 2 unidades de cada componente.
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setKitModal(null)}>Cancelar</button>
              <button className="sf-btn" onClick={handleSaveKit} disabled={savingKit}
                style={{ background: "linear-gradient(135deg,#a78bfa,#8b5cf6)" }}
              >
                {savingKit ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-floppy-disk" /> Guardar kit</>}
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
