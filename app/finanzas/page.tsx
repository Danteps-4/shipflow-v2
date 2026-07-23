"use client";

import { useState, useEffect } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

const CATEGORIAS_NEGOCIO = [
  "Videos",
  "Guiones",
  "Redes sociales",
  "Imágenes",
  "Servidor",
  "AT cliente",
  "Finanzas",
  "Google ADS",
  "Profit",
  "Otros",
] as const;
type CategoriaNegocio = (typeof CATEGORIAS_NEGOCIO)[number];

interface GastoNegocio {
  id: number;
  fecha: string;
  persona: string | null;
  categoria: CategoriaNegocio;
  detalle: string | null;
  cantidad: number | null;
  monto: number;
  pagado: boolean;
}

interface GastoPersonal {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
}

interface Suscripcion {
  id: number;
  nombre: string;
  monto: number;
  frecuencia: "mensual" | "anual";
  fecha_prox_pago: string;
  activa: boolean;
}

type Tab = "negocio" | "personal" | "suscripciones";

const EMPTY_GASTO_NEGOCIO = {
  fecha: today(), persona: "", categoria: "Otros" as CategoriaNegocio, detalle: "", cantidad: "", monto: "", pagado: false,
};
const EMPTY_GASTO_PERSONAL = { fecha: today(), descripcion: "", monto: "" };
const EMPTY_SUB = { nombre: "", monto: "", frecuencia: "mensual" as "mensual" | "anual", fecha_prox_pago: today() };

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
  const [tab, setTab]                 = useState<Tab>("negocio");

  // Gastos del negocio
  const [gastosNegocio, setGastosNegocio]   = useState<GastoNegocio[]>([]);
  const [loadingGN, setLoadingGN]           = useState(true);
  const [gastoNegocioModal, setGastoNegocioModal] = useState<Partial<GastoNegocio> | null>(null);
  const [gastoNegocioForm, setGastoNegocioForm]   = useState(EMPTY_GASTO_NEGOCIO);
  const [savingGN, setSavingGN]             = useState(false);
  const [filterCatNegocio, setFilterCatNegocio] = useState<CategoriaNegocio | "">("");
  const [filterMesNegocio, setFilterMesNegocio] = useState(false);
  const [togglingPagadoId, setTogglingPagadoId] = useState<number | null>(null);

  // Gastos personales
  const [gastosPersonales, setGastosPersonales] = useState<GastoPersonal[]>([]);
  const [loadingGP, setLoadingGP]           = useState(true);
  const [gastoPersonalModal, setGastoPersonalModal] = useState<Partial<GastoPersonal> | null>(null);
  const [gastoPersonalForm, setGastoPersonalForm]   = useState(EMPTY_GASTO_PERSONAL);
  const [savingGP, setSavingGP]             = useState(false);
  const [filterMesPersonal, setFilterMesPersonal] = useState(false);

  // Suscripciones state
  const [subs, setSubs]               = useState<Suscripcion[]>([]);
  const [loadingS, setLoadingS]       = useState(true);
  const [subModal, setSubModal]       = useState<Partial<Suscripcion> | null>(null);
  const [subForm, setSubForm]         = useState(EMPTY_SUB);
  const [savingS, setSavingS]         = useState(false);

  // ── Carga inicial ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchGastosNegocio();
    fetchGastosPersonales();
    fetchSubs();
  }, []);

  async function fetchGastosNegocio() {
    setLoadingGN(true);
    try {
      const r = await fetch("/api/finanzas/gastos-negocio");
      if (r.ok) setGastosNegocio((await r.json()).gastos ?? []);
    } finally { setLoadingGN(false); }
  }

  async function fetchGastosPersonales() {
    setLoadingGP(true);
    try {
      const r = await fetch("/api/finanzas/gastos-personales");
      if (r.ok) setGastosPersonales((await r.json()).gastos ?? []);
    } finally { setLoadingGP(false); }
  }

  async function fetchSubs() {
    setLoadingS(true);
    try {
      const r = await fetch("/api/finanzas/suscripciones");
      if (r.ok) setSubs((await r.json()).suscripciones ?? []);
    } finally { setLoadingS(false); }
  }

  // ── Gastos del negocio CRUD ──────────────────────────────────────────────────

  function openNewGastoNegocio() {
    setGastoNegocioModal({});
    setGastoNegocioForm(EMPTY_GASTO_NEGOCIO);
  }

  function openEditGastoNegocio(g: GastoNegocio) {
    setGastoNegocioModal(g);
    setGastoNegocioForm({
      fecha: g.fecha.slice(0, 10),
      persona: g.persona ?? "",
      categoria: g.categoria,
      detalle: g.detalle ?? "",
      cantidad: g.cantidad !== null ? String(Number(g.cantidad)) : "",
      monto: String(g.monto),
      pagado: g.pagado,
    });
  }

  async function saveGastoNegocio() {
    if (!gastoNegocioForm.fecha || !gastoNegocioForm.monto) return;
    setSavingGN(true);
    try {
      const isEdit = !!gastoNegocioModal?.id;
      const body = {
        ...(isEdit ? { id: gastoNegocioModal!.id } : {}),
        fecha: gastoNegocioForm.fecha,
        persona: gastoNegocioForm.persona || null,
        categoria: gastoNegocioForm.categoria,
        detalle: gastoNegocioForm.detalle || null,
        cantidad: gastoNegocioForm.cantidad || null,
        monto: parseFloat(gastoNegocioForm.monto as string),
        pagado: gastoNegocioForm.pagado,
      };
      const r = await fetch("/api/finanzas/gastos-negocio", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { await fetchGastosNegocio(); setGastoNegocioModal(null); }
    } finally { setSavingGN(false); }
  }

  async function togglePagado(g: GastoNegocio) {
    setTogglingPagadoId(g.id);
    try {
      const r = await fetch("/api/finanzas/gastos-negocio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, pagado: !g.pagado }),
      });
      if (r.ok) {
        const { gasto } = await r.json();
        setGastosNegocio(prev => prev.map(x => x.id === g.id ? gasto : x));
      }
    } finally { setTogglingPagadoId(null); }
  }

  async function deleteGastoNegocio(id: number) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await fetch("/api/finanzas/gastos-negocio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchGastosNegocio();
  }

  // ── Gastos personales CRUD ───────────────────────────────────────────────────

  function openNewGastoPersonal() {
    setGastoPersonalModal({});
    setGastoPersonalForm(EMPTY_GASTO_PERSONAL);
  }

  function openEditGastoPersonal(g: GastoPersonal) {
    setGastoPersonalModal(g);
    setGastoPersonalForm({ fecha: g.fecha.slice(0, 10), descripcion: g.descripcion, monto: String(g.monto) });
  }

  async function saveGastoPersonal() {
    if (!gastoPersonalForm.descripcion || !gastoPersonalForm.monto || !gastoPersonalForm.fecha) return;
    setSavingGP(true);
    try {
      const isEdit = !!gastoPersonalModal?.id;
      const body = {
        ...(isEdit ? { id: gastoPersonalModal!.id } : {}),
        fecha: gastoPersonalForm.fecha,
        descripcion: gastoPersonalForm.descripcion,
        monto: parseFloat(gastoPersonalForm.monto as string),
      };
      const r = await fetch("/api/finanzas/gastos-personales", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { await fetchGastosPersonales(); setGastoPersonalModal(null); }
    } finally { setSavingGP(false); }
  }

  async function deleteGastoPersonal(id: number) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await fetch("/api/finanzas/gastos-personales", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchGastosPersonales();
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

  const gastosNegocioMes      = gastosNegocio.filter((g) => mesActual(g.fecha));
  const totalGastosNegocioMes = gastosNegocioMes.reduce((s, g) => s + Number(g.monto), 0);

  const gastosPersonalesMes      = gastosPersonales.filter((g) => mesActual(g.fecha));
  const totalGastosPersonalesMes = gastosPersonalesMes.reduce((s, g) => s + Number(g.monto), 0);

  const subsActivas    = subs.filter((s) => s.activa);
  const totalSubsMes   = subsActivas.reduce((s, sub) => {
    return s + (sub.frecuencia === "anual" ? Number(sub.monto) / 12 : Number(sub.monto));
  }, 0);

  const gastosNegocioFiltered = gastosNegocio.filter((g) => {
    if (filterCatNegocio && g.categoria !== filterCatNegocio) return false;
    if (filterMesNegocio && !mesActual(g.fecha)) return false;
    return true;
  });

  const gastosPersonalesFiltered = gastosPersonales.filter((g) => {
    if (filterMesPersonal && !mesActual(g.fecha)) return false;
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
            Registrá los gastos del negocio, tus gastos personales y las suscripciones para tener un panorama claro de tus costos. Son de la cuenta en general, sin importar qué tienda esté activa.
          </p>

          {/* ── Cards resumen ─────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <StatCard
              icon="fas fa-briefcase"
              color="#3b82f6"
              label="Gastos negocio / mes"
              value={fmtMoney(totalGastosNegocioMes)}
              sub={`${gastosNegocioMes.length} registro${gastosNegocioMes.length !== 1 ? "s" : ""}`}
            />
            <StatCard
              icon="fas fa-user"
              color="#ec4899"
              label="Gastos personales / mes"
              value={fmtMoney(totalGastosPersonalesMes)}
              sub={`${gastosPersonalesMes.length} registro${gastosPersonalesMes.length !== 1 ? "s" : ""}`}
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
              value={fmtMoney(totalGastosNegocioMes + totalGastosPersonalesMes + totalSubsMes)}
              sub="Negocio + personal + suscripciones"
            />
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="sf-tabs" style={{ marginBottom: "1.5rem" }}>
            <button className={`sf-tab ${tab === "negocio" ? "active" : ""}`} onClick={() => setTab("negocio")}>
              <i className="fas fa-briefcase" /> Gastos del negocio
              <span className="sf-tab-badge">{gastosNegocio.length}</span>
            </button>
            <button className={`sf-tab ${tab === "personal" ? "active" : ""}`} onClick={() => setTab("personal")}>
              <i className="fas fa-user" /> Gastos personales
              <span className="sf-tab-badge">{gastosPersonales.length}</span>
            </button>
            <button className={`sf-tab ${tab === "suscripciones" ? "active" : ""}`} onClick={() => setTab("suscripciones")}>
              <i className="fas fa-rotate" /> Suscripciones
              <span className="sf-tab-badge">{subs.length}</span>
            </button>
          </div>

          {/* ── GASTOS DEL NEGOCIO ────────────────────────────────────────── */}
          {tab === "negocio" && (
            <>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <button className="sf-btn" onClick={openNewGastoNegocio}>
                  <i className="fas fa-plus" /> Agregar gasto
                </button>
                <select
                  className="sf-input"
                  style={{ maxWidth: 200 }}
                  value={filterCatNegocio}
                  onChange={(e) => setFilterCatNegocio(e.target.value as CategoriaNegocio | "")}
                >
                  <option value="">Todas las categorías</option>
                  {CATEGORIAS_NEGOCIO.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", color: "var(--text-muted)", cursor: "pointer" }}>
                  <input type="checkbox" checked={filterMesNegocio} onChange={(e) => setFilterMesNegocio(e.target.checked)} />
                  Solo este mes
                </label>
              </div>

              {loadingGN ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
                </div>
              ) : gastosNegocioFiltered.length === 0 ? (
                <EmptyState icon="fas fa-briefcase" text="No hay gastos del negocio registrados todavía." />
              ) : (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Persona</th>
                        <th>Categoría</th>
                        <th>Detalle</th>
                        <th style={{ textAlign: "right" }}>Cantidad</th>
                        <th style={{ textAlign: "right" }}>Monto</th>
                        <th>Pagado</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastosNegocioFiltered.map((g) => (
                        <tr key={g.id}>
                          <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: "0.85rem" }}>{fmtDate(g.fecha)}</td>
                          <td>{g.persona || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                          <td>
                            <span className="sf-badge" style={{ background: catColorNegocio(g.categoria) + "22", color: catColorNegocio(g.categoria), border: `1px solid ${catColorNegocio(g.categoria)}44` }}>
                              {g.categoria}
                            </span>
                          </td>
                          <td>{g.detalle || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                          <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{g.cantidad !== null ? Number(g.cantidad) : "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtMoney(Number(g.monto))}</td>
                          <td>
                            <label style={{ display: "flex", alignItems: "center", cursor: togglingPagadoId === g.id ? "default" : "pointer" }}>
                              <input
                                type="checkbox"
                                checked={g.pagado}
                                disabled={togglingPagadoId === g.id}
                                onChange={() => togglePagado(g)}
                              />
                            </label>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <button className="sf-icon-btn" title="Editar" onClick={() => openEditGastoNegocio(g)}>
                                <i className="fas fa-pen" />
                              </button>
                              <button className="sf-icon-btn danger" title="Eliminar" onClick={() => deleteGastoNegocio(g.id)}>
                                <i className="fas fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{ textAlign: "right", color: "var(--text-muted)", fontSize: "0.85rem" }}>Total filtrado</td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          {fmtMoney(gastosNegocioFiltered.reduce((s, g) => s + Number(g.monto), 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── GASTOS PERSONALES ─────────────────────────────────────────── */}
          {tab === "personal" && (
            <>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <button className="sf-btn" onClick={openNewGastoPersonal}>
                  <i className="fas fa-plus" /> Agregar gasto
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", color: "var(--text-muted)", cursor: "pointer" }}>
                  <input type="checkbox" checked={filterMesPersonal} onChange={(e) => setFilterMesPersonal(e.target.checked)} />
                  Solo este mes
                </label>
              </div>

              {loadingGP ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
                </div>
              ) : gastosPersonalesFiltered.length === 0 ? (
                <EmptyState icon="fas fa-user" text="No hay gastos personales registrados todavía." />
              ) : (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Descripción</th>
                        <th style={{ textAlign: "right" }}>Monto</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastosPersonalesFiltered.map((g) => (
                        <tr key={g.id}>
                          <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: "0.85rem" }}>{fmtDate(g.fecha)}</td>
                          <td>{g.descripcion}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtMoney(Number(g.monto))}</td>
                          <td>
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <button className="sf-icon-btn" title="Editar" onClick={() => openEditGastoPersonal(g)}>
                                <i className="fas fa-pen" />
                              </button>
                              <button className="sf-icon-btn danger" title="Eliminar" onClick={() => deleteGastoPersonal(g.id)}>
                                <i className="fas fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={1} style={{ textAlign: "right", color: "var(--text-muted)", fontSize: "0.85rem" }}>Total filtrado</td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          {fmtMoney(gastosPersonalesFiltered.reduce((s, g) => s + Number(g.monto), 0))}
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

      {/* ── Modal Gasto del negocio ───────────────────────────────────────────── */}
      {gastoNegocioModal !== null && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setGastoNegocioModal(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(520px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-briefcase" style={{ color: "#3b82f6" }} />
                {gastoNegocioModal.id ? "Editar gasto del negocio" : "Nuevo gasto del negocio"}
              </h3>
              <button className="sf-close-btn" onClick={() => setGastoNegocioModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Fecha
                  <input
                    className="sf-input"
                    type="date"
                    value={gastoNegocioForm.fecha}
                    onChange={(e) => setGastoNegocioForm(f => ({ ...f, fecha: e.target.value }))}
                    autoFocus
                  />
                </label>
                <label className="sf-label">
                  Persona
                  <input
                    className="sf-input"
                    value={gastoNegocioForm.persona}
                    onChange={(e) => setGastoNegocioForm(f => ({ ...f, persona: e.target.value }))}
                    placeholder="ej. Blas"
                  />
                </label>
              </div>
              <label className="sf-label">
                Categoría
                <select
                  className="sf-input"
                  value={gastoNegocioForm.categoria}
                  onChange={(e) => setGastoNegocioForm(f => ({ ...f, categoria: e.target.value as CategoriaNegocio }))}
                >
                  {CATEGORIAS_NEGOCIO.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="sf-label">
                Detalle
                <input
                  className="sf-input"
                  value={gastoNegocioForm.detalle}
                  onChange={(e) => setGastoNegocioForm(f => ({ ...f, detalle: e.target.value }))}
                  placeholder="ej. Renos 37"
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Cantidad
                  <input
                    className="sf-input"
                    type="number"
                    min="0"
                    step="1"
                    value={gastoNegocioForm.cantidad}
                    onChange={(e) => setGastoNegocioForm(f => ({ ...f, cantidad: e.target.value }))}
                    placeholder="ej. 5"
                  />
                </label>
                <label className="sf-label">
                  Monto ($)
                  <input
                    className="sf-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={gastoNegocioForm.monto}
                    onChange={(e) => setGastoNegocioForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00"
                  />
                </label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={gastoNegocioForm.pagado}
                  onChange={(e) => setGastoNegocioForm(f => ({ ...f, pagado: e.target.checked }))}
                />
                Ya está pagado
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setGastoNegocioModal(null)}>Cancelar</button>
              <button
                className="sf-btn"
                onClick={saveGastoNegocio}
                disabled={savingGN || !gastoNegocioForm.fecha || !gastoNegocioForm.monto}
              >
                {savingGN ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Gasto personal ──────────────────────────────────────────────── */}
      {gastoPersonalModal !== null && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setGastoPersonalModal(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-user" style={{ color: "#ec4899" }} />
                {gastoPersonalModal.id ? "Editar gasto personal" : "Nuevo gasto personal"}
              </h3>
              <button className="sf-close-btn" onClick={() => setGastoPersonalModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="sf-label">
                Descripción
                <input
                  className="sf-input"
                  value={gastoPersonalForm.descripcion}
                  onChange={(e) => setGastoPersonalForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="ej. Nafta"
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
                    value={gastoPersonalForm.monto}
                    onChange={(e) => setGastoPersonalForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00"
                  />
                </label>
                <label className="sf-label">
                  Fecha
                  <input
                    className="sf-input"
                    type="date"
                    value={gastoPersonalForm.fecha}
                    onChange={(e) => setGastoPersonalForm(f => ({ ...f, fecha: e.target.value }))}
                  />
                </label>
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setGastoPersonalModal(null)}>Cancelar</button>
              <button
                className="sf-btn"
                onClick={saveGastoPersonal}
                disabled={savingGP || !gastoPersonalForm.descripcion || !gastoPersonalForm.monto || !gastoPersonalForm.fecha}
              >
                {savingGP ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
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

const CAT_COLORS_NEGOCIO: Record<string, string> = {
  "Videos":         "#3b82f6",
  "Guiones":        "#a78bfa",
  "Redes sociales": "#ec4899",
  "Imágenes":       "#f59e0b",
  "Servidor":       "#10b981",
  "AT cliente":     "#06b6d4",
  "Finanzas":       "#84cc16",
  "Google ADS":     "#ef4444",
  "Profit":         "#eab308",
  "Otros":          "#6b7280",
};

function catColorNegocio(cat: string) {
  return CAT_COLORS_NEGOCIO[cat] ?? "#6b7280";
}
