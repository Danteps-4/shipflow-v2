"use client";

import { useState, useEffect, useRef, Fragment } from "react";
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

interface Transferencia {
  id: number;
  monto: number;
  comprobante_url: string | null;
  comprobante_public_id: string | null;
  enviada: boolean;
  recibida: boolean;
  cierre_id: number | null;
  created_by: string;
  created_at: string;
}

interface TransferenciaCierre {
  id: number;
  created_by: string;
  created_at: string;
  cantidad: number;
  total: number;
  enviadas: number;
  recibidas: number;
}

type Tab = "gastos" | "suscripciones" | "transferencias";

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

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
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

  // Transferencias state
  const [transferencias, setTransferencias]   = useState<Transferencia[]>([]);
  const [loadingT, setLoadingT]               = useState(true);
  const [cierres, setCierres]                 = useState<TransferenciaCierre[]>([]);
  const [loadingCierres, setLoadingCierres]   = useState(true);
  const [expandedCierre, setExpandedCierre]   = useState<number | null>(null);
  const [cierreDetalle, setCierreDetalle]     = useState<Record<number, Transferencia[]>>({});
  const [cerrandoDia, setCerrandoDia]         = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [nuevoMonto, setNuevoMonto]           = useState("");
  const [nuevoComprobante, setNuevoComprobante] = useState<{ url: string; publicId: string } | null>(null);
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [nuevaEnviada, setNuevaEnviada]       = useState(false);
  const [nuevaRecibida, setNuevaRecibida]     = useState(false);
  const [savingT, setSavingT]                 = useState(false);
  const [guardandoFlagId, setGuardandoFlagId] = useState<number | null>(null);
  const comprobanteInputRef = useRef<HTMLInputElement>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchGastos();
    fetchSubs();
    fetchTransferencias();
    fetchCierres();
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

  async function fetchTransferencias() {
    setLoadingT(true);
    try {
      const r = await fetch("/api/finanzas/transferencias");
      if (r.ok) setTransferencias((await r.json()).transferencias ?? []);
    } finally { setLoadingT(false); }
  }

  async function fetchCierres() {
    setLoadingCierres(true);
    try {
      const r = await fetch("/api/finanzas/transferencias/cierres");
      if (r.ok) setCierres((await r.json()).cierres ?? []);
    } finally { setLoadingCierres(false); }
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

  // ── Transferencias CRUD ──────────────────────────────────────────────────────

  function openNewTransferencia() {
    setNuevoMonto("");
    setNuevoComprobante(null);
    setNuevaEnviada(false);
    setNuevaRecibida(false);
    setTransferModalOpen(true);
  }

  async function subirComprobante(file: File) {
    setSubiendoComprobante(true);
    try {
      const firmaRes = await fetch("/api/finanzas/upload-signature", { method: "POST" });
      if (!firmaRes.ok) throw new Error("No se pudo firmar la subida");
      const { timestamp, signature, apiKey, cloudName } = await firmaRes.json();

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("signature", signature);
      form.append("folder", "shipflow-finanzas");

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) throw new Error("Error al subir a Cloudinary");
      const data = await uploadRes.json();
      setNuevoComprobante({ url: data.secure_url, publicId: data.public_id });
    } catch {
      alert("No se pudo subir el comprobante. Probá de nuevo.");
    } finally {
      setSubiendoComprobante(false);
    }
  }

  async function saveTransferencia() {
    const monto = parseFloat(nuevoMonto);
    if (!monto || monto <= 0) return;
    setSavingT(true);
    try {
      const r = await fetch("/api/finanzas/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto,
          comprobanteUrl: nuevoComprobante?.url ?? null,
          comprobantePublicId: nuevoComprobante?.publicId ?? null,
          enviada: nuevaEnviada,
          recibida: nuevaRecibida,
        }),
      });
      if (r.ok) { await fetchTransferencias(); setTransferModalOpen(false); }
    } finally {
      setSavingT(false);
    }
  }

  // Tilda enviada/recibida al toque (sin modal), tanto en la lista activa
  // como en el historial ya cerrado — la financiera puede confirmar después.
  async function toggleFlag(t: Transferencia, campo: "enviada" | "recibida", cierreId: number | null) {
    setGuardandoFlagId(t.id);
    try {
      const r = await fetch("/api/finanzas/transferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, [campo]: !t[campo] }),
      });
      if (!r.ok) return;
      const { transferencia } = await r.json();
      if (cierreId === null) {
        setTransferencias(prev => prev.map(x => x.id === t.id ? transferencia : x));
      } else {
        setCierreDetalle(prev => ({
          ...prev,
          [cierreId]: (prev[cierreId] ?? []).map(x => x.id === t.id ? transferencia : x),
        }));
        setCierres(prev => prev.map(c => {
          if (c.id !== cierreId) return c;
          const delta = campo === "enviada"
            ? { enviadas: c.enviadas + (transferencia.enviada ? 1 : -1) }
            : { recibidas: c.recibidas + (transferencia.recibida ? 1 : -1) };
          return { ...c, ...delta };
        }));
      }
    } finally {
      setGuardandoFlagId(null);
    }
  }

  async function deleteTransferencia(id: number) {
    if (!confirm("¿Eliminar esta transferencia?")) return;
    await fetch("/api/finanzas/transferencias", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchTransferencias();
  }

  async function toggleCierre(cierreId: number) {
    if (expandedCierre === cierreId) { setExpandedCierre(null); return; }
    setExpandedCierre(cierreId);
    if (!cierreDetalle[cierreId]) {
      const r = await fetch(`/api/finanzas/transferencias?cierreId=${cierreId}`);
      if (r.ok) {
        const { transferencias: detalle } = await r.json();
        setCierreDetalle(prev => ({ ...prev, [cierreId]: detalle ?? [] }));
      }
    }
  }

  async function cerrarDia() {
    if (!transferencias.length) return;
    const total = transferencias.reduce((s, t) => s + Number(t.monto), 0);
    if (!confirm(`¿Cerrar el día con ${transferencias.length} transferencia${transferencias.length !== 1 ? "s" : ""} por un total de ${fmtMoney(total)}? Empezás una cuenta nueva en cero.`)) return;
    setCerrandoDia(true);
    try {
      const r = await fetch("/api/finanzas/transferencias/cerrar", { method: "POST" });
      if (r.ok) {
        await fetchTransferencias();
        await fetchCierres();
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d.error ?? "Error al cerrar el día");
      }
    } finally {
      setCerrandoDia(false);
    }
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
            <button className={`sf-tab ${tab === "transferencias" ? "active" : ""}`} onClick={() => setTab("transferencias")}>
              <i className="fas fa-money-bill-transfer" /> Transferencias
              <span className="sf-tab-badge">{transferencias.length}</span>
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

          {/* ── TRANSFERENCIAS ────────────────────────────────────────────── */}
          {tab === "transferencias" && (
            <>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <button className="sf-btn" onClick={openNewTransferencia}>
                  <i className="fas fa-plus" /> Agregar transferencia
                </button>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Total activo: </span>
                    <strong style={{ fontFamily: "monospace" }}>
                      {fmtMoney(transferencias.reduce((s, t) => s + Number(t.monto), 0))}
                    </strong>
                    <span style={{ color: "var(--text-muted)" }}> ({transferencias.length})</span>
                  </div>
                  <button className="sf-btn sf-btn-secondary" onClick={cerrarDia} disabled={!transferencias.length || cerrandoDia}>
                    {cerrandoDia
                      ? <><i className="fas fa-spinner fa-spin" /> Cerrando…</>
                      : <><i className="fas fa-lock" /> Cerrar el día</>
                    }
                  </button>
                </div>
              </div>

              {loadingT ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
                </div>
              ) : transferencias.length === 0 ? (
                <EmptyState icon="fas fa-money-bill-transfer" text="No hay transferencias cargadas todavía." />
              ) : (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Comprobante</th>
                        <th style={{ textAlign: "right" }}>Monto</th>
                        <th>Enviada</th>
                        <th>Recibida</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferencias.map(t => (
                        <TransferenciaRow
                          key={t.id}
                          t={t}
                          onToggle={campo => toggleFlag(t, campo, null)}
                          onDelete={() => deleteTransferencia(t.id)}
                          saving={guardandoFlagId === t.id}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Total</td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          {fmtMoney(transferencias.reduce((s, t) => s + Number(t.monto), 0))}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <hr className="sf-divider" style={{ margin: "2rem 0" }} />

              <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.25rem" }}>Historial de cierres</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                Los días ya cerrados. Podés seguir marcando &quot;Recibida&quot; cuando la financiera confirme.
              </p>

              {loadingCierres ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.3rem" }} />
                </div>
              ) : cierres.length === 0 ? (
                <EmptyState icon="fas fa-clock-rotate-left" text="Todavía no cerraste ningún día." />
              ) : (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th style={{ width: 24 }}></th>
                        <th>Cierre</th>
                        <th style={{ textAlign: "right" }}>Cantidad</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                        <th style={{ textAlign: "right" }}>Enviadas</th>
                        <th style={{ textAlign: "right" }}>Recibidas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cierres.map(c => {
                        const expanded = expandedCierre === c.id;
                        return (
                          <Fragment key={c.id}>
                            <tr style={{ cursor: "pointer" }} onClick={() => toggleCierre(c.id)}>
                              <td>
                                <i className={`fas fa-chevron-${expanded ? "down" : "right"}`} style={{ fontSize: "0.7rem", color: "var(--text-muted)" }} />
                              </td>
                              <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.created_at)}</td>
                              <td style={{ textAlign: "right" }}>{c.cantidad}</td>
                              <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtMoney(c.total)}</td>
                              <td style={{ textAlign: "right", color: c.enviadas === c.cantidad ? "var(--success-color)" : "var(--text-muted)" }}>
                                {c.enviadas} / {c.cantidad}
                              </td>
                              <td style={{ textAlign: "right", color: c.recibidas === c.cantidad ? "var(--success-color)" : "var(--warning-color)" }}>
                                {c.recibidas} / {c.cantidad}
                              </td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={6} style={{ padding: 0, background: "rgba(15,23,42,0.3)" }}>
                                  {!cierreDetalle[c.id] ? (
                                    <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)" }}>
                                      <i className="fas fa-spinner fa-spin" />
                                    </div>
                                  ) : (
                                    <table className="sf-table" style={{ margin: 0 }}>
                                      <tbody>
                                        {cierreDetalle[c.id].map(t => (
                                          <TransferenciaRow
                                            key={t.id}
                                            t={t}
                                            onToggle={campo => toggleFlag(t, campo, c.id)}
                                            saving={guardandoFlagId === t.id}
                                          />
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
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

      {/* ── Modal Transferencia ──────────────────────────────────────────────── */}
      {transferModalOpen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setTransferModalOpen(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-money-bill-transfer" style={{ color: "var(--primary-color)" }} />
                Nueva transferencia
              </h3>
              <button className="sf-close-btn" onClick={() => setTransferModalOpen(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="sf-label">
                Comprobante
                <div
                  className="sf-dropzone"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) subirComprobante(f); }}
                  onClick={() => comprobanteInputRef.current?.click()}
                >
                  <input
                    ref={comprobanteInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) subirComprobante(f); e.target.value = ""; }}
                  />
                  {subiendoComprobante ? (
                    <>
                      <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem", color: "var(--primary-color)" }} />
                      <span style={{ fontWeight: 600 }}>Subiendo…</span>
                    </>
                  ) : nuevoComprobante ? (
                    <>
                      <i className="fas fa-circle-check" style={{ fontSize: "1.5rem", color: "var(--success-color)" }} />
                      <span style={{ fontWeight: 600 }}>Comprobante cargado</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click para cambiar</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-cloud-arrow-up" style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} />
                      <span style={{ fontWeight: 600 }}>Arrastrá o hacé click</span>
                    </>
                  )}
                </div>
              </label>
              <label className="sf-label">
                Monto ($)
                <input
                  className="sf-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevoMonto}
                  onChange={e => setNuevoMonto(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </label>
              <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={nuevaEnviada} onChange={e => setNuevaEnviada(e.target.checked)} />
                  Ya la enviamos a la financiera
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={nuevaRecibida} onChange={e => setNuevaRecibida(e.target.checked)} />
                  Ya está recibida
                </label>
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setTransferModalOpen(false)}>Cancelar</button>
              <button
                className="sf-btn"
                onClick={saveTransferencia}
                disabled={savingT || !nuevoMonto || subiendoComprobante}
              >
                {savingT ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
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

interface TransferenciaFE {
  id: number;
  monto: number;
  comprobante_url: string | null;
  enviada: boolean;
  recibida: boolean;
}

function TransferenciaRow({ t, onToggle, onDelete, saving }: {
  t: TransferenciaFE;
  onToggle: (campo: "enviada" | "recibida") => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  return (
    <tr>
      <td>
        {t.comprobante_url ? (
          <a href={t.comprobante_url} target="_blank" rel="noopener noreferrer">
            <img src={t.comprobante_url} alt="Comprobante" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
          </a>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>
        )}
      </td>
      <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtMoney(Number(t.monto))}</td>
      <td>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: saving ? "default" : "pointer" }}>
          <input type="checkbox" checked={t.enviada} disabled={saving} onChange={() => onToggle("enviada")} />
          <span style={{ fontSize: "0.82rem", color: t.enviada ? "var(--success-color)" : "var(--text-muted)" }}>
            {t.enviada ? "Enviada" : "Pendiente"}
          </span>
        </label>
      </td>
      <td>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: saving ? "default" : "pointer" }}>
          <input type="checkbox" checked={t.recibida} disabled={saving} onChange={() => onToggle("recibida")} />
          <span style={{ fontSize: "0.82rem", color: t.recibida ? "var(--success-color)" : "var(--warning-color)" }}>
            {t.recibida ? "Recibida" : "Pendiente"}
          </span>
        </label>
      </td>
      <td>
        {onDelete && (
          <button className="sf-icon-btn danger" title="Eliminar" onClick={onDelete}>
            <i className="fas fa-trash" />
          </button>
        )}
      </td>
    </tr>
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
