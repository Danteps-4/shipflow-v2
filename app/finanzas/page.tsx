"use client";

import { useState, useEffect } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

const CATEGORIAS = [
  "Operaciones",
  "Marketing",
  "Software",
  "Logística",
  "Impuestos y tasas",
  "Personal",
  "Otros",
] as const;
type Categoria = (typeof CATEGORIAS)[number];

interface Gasto {
  id: number;
  descripcion: string;
  monto: number;
  categoria: Categoria;
  fecha: string;
}

interface Suscripcion {
  id: number;
  nombre: string;
  monto: number;
  frecuencia: "mensual" | "anual";
  fecha_prox_pago: string;
  activa: boolean;
}

type Tab = "gastos" | "suscripciones";

const EMPTY_GASTO = { descripcion: "", monto: "", categoria: "Otros" as Categoria, fecha: today() };
const EMPTY_SUB   = { nombre: "", monto: "", frecuencia: "mensual" as "mensual" | "anual", fecha_prox_pago: today() };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function mesActual(iso: string) {
  const now = new Date();
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  return y === now.getFullYear() && m === now.getMonth() + 1;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanzasPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab]                 = useState<Tab>("gastos");

  // Gastos state
  const [gastos, setGastos]           = useState<Gasto[]>([]);
  const [loadingG, setLoadingG]       = useState(true);
  const [gastoModal, setGastoModal]   = useState<Partial<Gasto> | null>(null);
  const [gastoForm, setGastoForm]     = useState(EMPTY_GASTO);
  const [savingG, setSavingG]         = useState(false);
  const [filterCat, setFilterCat]     = useState<Categoria | "">("");
  const [filterMes, setFilterMes]     = useState(false);

  // Suscripciones state
  const [subs, setSubs]               = useState<Suscripcion[]>([]);
  const [loadingS, setLoadingS]       = useState(true);
  const [subModal, setSubModal]       = useState<Partial<Suscripcion> | null>(null);
  const [subForm, setSubForm]         = useState(EMPTY_SUB);
  const [savingS, setSavingS]         = useState(false);

  // ── Carga inicial ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchGastos();
    fetchSubs();
  }, []);

  async function fetchGastos() {
    setLoadingG(true);
    try {
      const r = await fetch("/api/finanzas/gastos");
      if (r.ok) setGastos((await r.json()).gastos ?? []);
    } finally { setLoadingG(false); }
  }

  async function fetchSubs() {
    setLoadingS(true);
    try {
      const r = await fetch("/api/finanzas/suscripciones");
      if (r.ok) setSubs((await r.json()).suscripciones ?? []);
    } finally { setLoadingS(false); }
  }

  // ── Gastos CRUD ──────────────────────────────────────────────────────────────

  function openNewGasto() {
    setGastoModal({});
    setGastoForm(EMPTY_GASTO);
  }

  function openEditGasto(g: Gasto) {
    setGastoModal(g);
    setGastoForm({ descripcion: g.descripcion, monto: String(g.monto), categoria: g.categoria, fecha: g.fecha.slice(0, 10) });
  }

  async function saveGasto() {
    if (!gastoForm.descripcion || !gastoForm.monto || !gastoForm.fecha) return;
    setSavingG(true);
    try {
      const isEdit = !!gastoModal?.id;
      const body = {
        ...(isEdit ? { id: gastoModal!.id } : {}),
        descripcion: gastoForm.descripcion,
        monto: parseFloat(gastoForm.monto as string),
        categoria: gastoForm.categoria,
        fecha: gastoForm.fecha,
      };
      const r = await fetch("/api/finanzas/gastos", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { await fetchGastos(); setGastoModal(null); }
    } finally { setSavingG(false); }
  }

  async function deleteGasto(id: number) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await fetch("/api/finanzas/gastos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchGastos();
  }

  // ── Suscripciones CRUD ───────────────────────────────────────────────────────

  function openNewSub() {
    setSubModal({});
    setSubForm(EMPTY_SUB);
  }

  function openEditSub(s: Suscripcion) {
    setSubModal(s);
    setSubForm({
      nombre: s.nombre,
      monto: String(s.monto),
      frecuencia: s.frecuencia,
      fecha_prox_pago: s.fecha_prox_pago.slice(0, 10),
    });
  }

  async function saveSub() {
    if (!subForm.nombre || !subForm.monto || !subForm.fecha_prox_pago) return;
    setSavingS(true);
    try {
      const isEdit = !!subModal?.id;
      const body = {
        ...(isEdit ? { id: subModal!.id, activa: (subModal as Suscripcion).activa } : {}),
        nombre: subForm.nombre,
        monto: parseFloat(subForm.monto as string),
        frecuencia: subForm.frecuencia,
        fecha_prox_pago: subForm.fecha_prox_pago,
      };
      const r = await fetch("/api/finanzas/suscripciones", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { await fetchSubs(); setSubModal(null); }
    } finally { setSavingS(false); }
  }

  async function toggleActiva(s: Suscripcion) {
    await fetch("/api/finanzas/suscripciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, activa: !s.activa }),
    });
    await fetchSubs();
  }

  async function deleteSub(id: number) {
    if (!confirm("¿Eliminar esta suscripción?")) return;
    await fetch("/api/finanzas/suscripciones", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchSubs();
  }

  // ── Métricas ─────────────────────────────────────────────────────────────────

  const gastosMes      = gastos.filter((g) => mesActual(g.fecha));
  const totalGastosMes = gastosMes.reduce((s, g) => s + Number(g.monto), 0);

  const subsActivas    = subs.filter((s) => s.activa);
  const totalSubsMes   = subsActivas.reduce((s, sub) => {
    return s + (sub.frecuencia === "anual" ? Number(sub.monto) / 12 : Number(sub.monto));
  }, 0);

  const gastosFiltered = gastos.filter((g) => {
    if (filterCat && g.categoria !== filterCat) return false;
    if (filterMes && !mesActual(g.fecha)) return false;
    return true;
  });

  // ── Render ───────────────────────────────────────────────────────────────────

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

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Finanzas</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Registrá gastos y suscripciones para tener un panorama claro de tus costos.
          </p>

          {/* ── Cards resumen ─────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <StatCard
              icon="fas fa-receipt"
              color="#3b82f6"
              label="Gastos este mes"
              value={fmtMoney(totalGastosMes)}
              sub={`${gastosMes.length} registro${gastosMes.length !== 1 ? "s" : ""}`}
            />
            <StatCard
              icon="fas fa-rotate"
              color="#a78bfa"
              label="Suscripciones / mes"
              value={fmtMoney(totalSubsMes)}
              sub={`${subsActivas.length} activa${subsActivas.length !== 1 ? "s" : ""}`}
            />
            <StatCard
              icon="fas fa-chart-pie"
              color="#f59e0b"
              label="Costo total / mes"
              value={fmtMoney(totalGastosMes + totalSubsMes)}
              sub="Gastos + suscripciones"
            />
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="sf-tabs" style={{ marginBottom: "1.5rem" }}>
            <button className={`sf-tab ${tab === "gastos" ? "active" : ""}`} onClick={() => setTab("gastos")}>
              <i className="fas fa-receipt" /> Gastos
              <span className="sf-tab-badge">{gastos.length}</span>
            </button>
            <button className={`sf-tab ${tab === "suscripciones" ? "active" : ""}`} onClick={() => setTab("suscripciones")}>
              <i className="fas fa-rotate" /> Suscripciones
              <span className="sf-tab-badge">{subs.length}</span>
            </button>
          </div>

          {/* ── GASTOS ────────────────────────────────────────────────────── */}
          {tab === "gastos" && (
            <>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <button className="sf-btn" onClick={openNewGasto}>
                  <i className="fas fa-plus" /> Agregar gasto
                </button>
                <select
                  className="sf-input"
                  style={{ maxWidth: 200 }}
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value as Categoria | "")}
                >
                  <option value="">Todas las categorías</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", color: "var(--text-muted)", cursor: "pointer" }}>
                  <input type="checkbox" checked={filterMes} onChange={(e) => setFilterMes(e.target.checked)} />
                  Solo este mes
                </label>
              </div>

              {loadingG ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
                </div>
              ) : gastosFiltered.length === 0 ? (
                <EmptyState icon="fas fa-receipt" text="No hay gastos registrados todavía." />
              ) : (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Descripción</th>
                        <th>Categoría</th>
                        <th style={{ textAlign: "right" }}>Monto</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastosFiltered.map((g) => (
                        <tr key={g.id}>
                          <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: "0.85rem" }}>{fmtDate(g.fecha)}</td>
                          <td>{g.descripcion}</td>
                          <td>
                            <span className="sf-badge" style={{ background: catColor(g.categoria) + "22", color: catColor(g.categoria), border: `1px solid ${catColor(g.categoria)}44` }}>
                              {g.categoria}
                            </span>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtMoney(Number(g.monto))}</td>
                          <td>
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <button className="sf-icon-btn" title="Editar" onClick={() => openEditGasto(g)}>
                                <i className="fas fa-pen" />
                              </button>
                              <button className="sf-icon-btn danger" title="Eliminar" onClick={() => deleteGasto(g.id)}>
                                <i className="fas fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ textAlign: "right", color: "var(--text-muted)", fontSize: "0.85rem" }}>Total filtrado</td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          {fmtMoney(gastosFiltered.reduce((s, g) => s + Number(g.monto), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── SUSCRIPCIONES ─────────────────────────────────────────────── */}
          {tab === "suscripciones" && (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <button className="sf-btn" onClick={openNewSub}>
                  <i className="fas fa-plus" /> Agregar suscripción
                </button>
              </div>

              {loadingS ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
                </div>
              ) : subs.length === 0 ? (
                <EmptyState icon="fas fa-rotate" text="No hay suscripciones registradas todavía." />
              ) : (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th>Frecuencia</th>
                        <th style={{ textAlign: "right" }}>Monto</th>
                        <th style={{ textAlign: "right" }}>Equiv. mensual</th>
                        <th>Próximo pago</th>
                        <th>Estado</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s) => {
                        const equiv = s.frecuencia === "anual" ? Number(s.monto) / 12 : Number(s.monto);
                        const proxDate = new Date(s.fecha_prox_pago + "T12:00:00");
                        const hoy      = new Date();
                        const diffDays = Math.ceil((proxDate.getTime() - hoy.getTime()) / 86400000);
                        const proxCss  = diffDays <= 7 ? "var(--error-color)" : diffDays <= 14 ? "#f59e0b" : "var(--text-muted)";

                        return (
                          <tr key={s.id} style={{ opacity: s.activa ? 1 : 0.45 }}>
                            <td style={{ fontWeight: 600 }}>{s.nombre}</td>
                            <td>
                              <span className="sf-badge" style={{ background: s.frecuencia === "anual" ? "rgba(167,139,250,0.15)" : "rgba(59,130,246,0.12)", color: s.frecuencia === "anual" ? "#a78bfa" : "#60a5fa" }}>
                                {s.frecuencia === "anual" ? "Anual" : "Mensual"}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(Number(s.monto))}</td>
                            <td style={{ textAlign: "right", fontFamily: "monospace", color: "var(--text-muted)", fontSize: "0.85rem" }}>{fmtMoney(equiv)}</td>
                            <td style={{ color: s.activa ? proxCss : "var(--text-muted)", whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                              {fmtDate(s.fecha_prox_pago)}
                              {s.activa && diffDays <= 7 && (
                                <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", fontWeight: 700 }}>
                                  {diffDays <= 0 ? "(vencida)" : `(${diffDays}d)`}
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                className={`sf-badge ${s.activa ? "" : "sf-badge-error"}`}
                                style={{
                                  cursor: "pointer",
                                  background: s.activa ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                                  color: s.activa ? "var(--success-color)" : "var(--error-color)",
                                  border: "none",
                                  padding: "0.2rem 0.6rem",
                                  borderRadius: "var(--radius)",
                                }}
                                onClick={() => toggleActiva(s)}
                                title={s.activa ? "Desactivar" : "Activar"}
                              >
                                {s.activa ? "Activa" : "Inactiva"}
                              </button>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "0.4rem" }}>
                                <button className="sf-icon-btn" title="Editar" onClick={() => openEditSub(s)}>
                                  <i className="fas fa-pen" />
                                </button>
                                <button className="sf-icon-btn danger" title="Eliminar" onClick={() => deleteSub(s.id)}>
                                  <i className="fas fa-trash" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ textAlign: "right", color: "var(--text-muted)", fontSize: "0.85rem" }}>Total mensual (activas)</td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          {fmtMoney(totalSubsMes)}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
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

      {/* ── Modal Gasto ─────────────────────────────────────────────────────── */}
      {gastoModal !== null && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setGastoModal(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-receipt" style={{ color: "#3b82f6" }} />
                {gastoModal.id ? "Editar gasto" : "Nuevo gasto"}
              </h3>
              <button className="sf-close-btn" onClick={() => setGastoModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="sf-label">
                Descripción
                <input
                  className="sf-input"
                  value={gastoForm.descripcion}
                  onChange={(e) => setGastoForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="ej. Cajas de cartón"
                  autoFocus
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Monto ($)
                  <input
                    className="sf-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={gastoForm.monto}
                    onChange={(e) => setGastoForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00"
                  />
                </label>
                <label className="sf-label">
                  Fecha
                  <input
                    className="sf-input"
                    type="date"
                    value={gastoForm.fecha}
                    onChange={(e) => setGastoForm(f => ({ ...f, fecha: e.target.value }))}
                  />
                </label>
              </div>
              <label className="sf-label">
                Categoría
                <select
                  className="sf-input"
                  value={gastoForm.categoria}
                  onChange={(e) => setGastoForm(f => ({ ...f, categoria: e.target.value as Categoria }))}
                >
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setGastoModal(null)}>Cancelar</button>
              <button
                className="sf-btn"
                onClick={saveGasto}
                disabled={savingG || !gastoForm.descripcion || !gastoForm.monto || !gastoForm.fecha}
              >
                {savingG ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Suscripción ────────────────────────────────────────────────── */}
      {subModal !== null && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setSubModal(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-rotate" style={{ color: "#a78bfa" }} />
                {subModal.id ? "Editar suscripción" : "Nueva suscripción"}
              </h3>
              <button className="sf-close-btn" onClick={() => setSubModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="sf-label">
                Servicio
                <input
                  className="sf-input"
                  value={subForm.nombre}
                  onChange={(e) => setSubForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="ej. Adobe Acrobat, Railway, etc."
                  autoFocus
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Monto ($)
                  <input
                    className="sf-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={subForm.monto}
                    onChange={(e) => setSubForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00"
                  />
                </label>
                <label className="sf-label">
                  Frecuencia
                  <select
                    className="sf-input"
                    value={subForm.frecuencia}
                    onChange={(e) => setSubForm(f => ({ ...f, frecuencia: e.target.value as "mensual" | "anual" }))}
                  >
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual</option>
                  </select>
                </label>
              </div>
              <label className="sf-label">
                Próximo pago
                <input
                  className="sf-input"
                  type="date"
                  value={subForm.fecha_prox_pago}
                  onChange={(e) => setSubForm(f => ({ ...f, fecha_prox_pago: e.target.value }))}
                />
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setSubModal(null)}>Cancelar</button>
              <button
                className="sf-btn"
                onClick={saveSub}
                disabled={savingS || !subForm.nombre || !subForm.monto || !subForm.fecha_prox_pago}
              >
                {savingS ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function StatCard({ icon, color, label, value, sub }: { icon: string; color: string; label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: "rgba(15,23,42,0.5)",
      border: "1px solid var(--border-color)",
      borderRadius: "var(--radius)",
      padding: "1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
        <i className={icon} style={{ color, fontSize: "1rem" }} />
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>{sub}</div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
      <i className={icon} style={{ fontSize: "2rem", marginBottom: "0.75rem", display: "block", opacity: 0.4 }} />
      <p style={{ fontSize: "0.9rem" }}>{text}</p>
    </div>
  );
}

const CAT_COLORS: Record<string, string> = {
  "Operaciones":      "#3b82f6",
  "Marketing":        "#f59e0b",
  "Software":         "#a78bfa",
  "Logística":        "#10b981",
  "Impuestos y tasas":"#ef4444",
  "Personal":         "#ec4899",
  "Otros":            "#6b7280",
};

function catColor(cat: string) {
  return CAT_COLORS[cat] ?? "#6b7280";
}
