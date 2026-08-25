"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import RetiroHistorial, { RetiroHistorialEntryUI } from "@/components/RetiroHistorial";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Retiro {
  id: number;
  codigo: string;
  canal_pedido: "tiendanube" | "mercadolibre" | null;
  numero_pedido: string | null;
  pedido_metodo_entrega_original: string | null;
  pedido_tracking_original: string | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_dni: string | null;
  productos_json: { sku: string | null; nombre: string; cantidad: number; precio: number | null }[];
  total: string;
  estado_retiro: "pendiente_preparar" | "listo" | "retirado" | "cancelado";
  estado_pago: "pagado" | "pendiente" | "cobrar_al_retirar";
  medio_pago: string | null;
  fecha_estimada: string | null;
  notas: string | null;
  entregado_por: string | null;
  entregado_at: string | null;
  cancelado_at: string | null;
  cancelado_motivo: string | null;
  created_by: string;
  created_at: string;
  historial: RetiroHistorialEntryUI[];
}

const ESTADO_RETIRO_LABELS: Record<string, string> = {
  pendiente_preparar: "Pendiente de preparar",
  listo: "Listo para retirar",
  retirado: "Retirado",
  cancelado: "Cancelado",
};
const ESTADO_PAGO_LABELS: Record<string, string> = {
  pagado: "PAGADO",
  pendiente: "PENDIENTE",
  cobrar_al_retirar: "COBRAR AL RETIRAR",
};
const ESTADO_PAGO_COLORS: Record<string, string> = {
  pagado: "var(--success-color)",
  pendiente: "var(--warning-color)",
  cobrar_al_retirar: "var(--error-color)",
};
const CANAL_LABELS: Record<string, string> = { tiendanube: "Tienda Nube", mercadolibre: "Mercado Libre" };
const MEDIOS_PAGO_LABELS: Record<string, string> = {
  efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", mercado_pago: "Mercado Pago", otro: "Otro",
};
const MEDIOS_PAGO: { value: string; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "otro", label: "Otro" },
];

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n);
}
function fmtDate(iso: string | null) {
  if (!iso) return "Sin fecha confirmada";
  // Neon devuelve las columnas DATE como timestamp ISO completo
  // (ej. "2026-08-26T03:00:00.000Z"), no como "YYYY-MM-DD" puro.
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function RetiroDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [retiro, setRetiro] = useState<Retiro | null>(null);
  const [loading, setLoading] = useState(true);
  const [puedeSupervisar, setPuedeSupervisar] = useState(false);

  const [accionando, setAccionando] = useState(false);
  const [pidiendoConfirmacionPago, setPidiendoConfirmacionPago] = useState(false);
  const [pidiendoMedioCobro, setPidiendoMedioCobro] = useState(false);
  const [medioPagoSeleccion, setMedioPagoSeleccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editandoFecha, setEditandoFecha] = useState(false);
  const [fechaEdit, setFechaEdit] = useState("");
  const [editandoNotas, setEditandoNotas] = useState(false);
  const [notasEdit, setNotasEdit] = useState("");

  const fetchRetiro = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/retiros/${id}`);
      if (r.ok) setRetiro((await r.json()).retiro ?? null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRetiro();
    fetch("/api/user/me").then(r => r.json()).then(d => {
      setPuedeSupervisar(d.user?.role === "admin" || !!d.user?.retirosPuedeSupervisar);
    }).catch(() => {});
  }, [fetchRetiro]);

  async function ejecutarAccion(body: Record<string, unknown>) {
    setAccionando(true);
    setError(null);
    try {
      const r = await fetch(`/api/retiros/${id}/accion`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (r.ok) {
        await fetchRetiro(true);
        setPidiendoConfirmacionPago(false);
        return true;
      } else {
        const d = await r.json().catch(() => null);
        setError(d?.error ?? "No se pudo completar la acción");
        return false;
      }
    } finally {
      setAccionando(false);
    }
  }

  function onConfirmarEntregaClick() {
    if (!retiro) return;
    if (retiro.estado_pago === "pagado") {
      ejecutarAccion({ accion: "confirmar_entrega" });
    } else {
      setPidiendoConfirmacionPago(true);
    }
  }

  async function eliminarRetiro() {
    if (!confirm(`¿Eliminar el retiro ${retiro?.codigo}? Esta acción no se puede deshacer.`)) return;
    setAccionando(true);
    try {
      const r = await fetch(`/api/retiros/${id}`, { method: "DELETE" });
      if (r.ok) router.push("/retiros");
      else {
        const d = await r.json().catch(() => null);
        setError(d?.error ?? "No se pudo eliminar");
      }
    } finally {
      setAccionando(false);
    }
  }

  function abrirEditarFecha() {
    setFechaEdit(retiro?.fecha_estimada?.slice(0, 10) ?? "");
    setEditandoFecha(true);
  }
  async function guardarFecha() {
    const r = await fetch(`/api/retiros/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fechaEstimada: fechaEdit || null }),
    });
    if (r.ok) { await fetchRetiro(true); setEditandoFecha(false); }
  }

  function abrirEditarNotas() {
    setNotasEdit(retiro?.notas ?? "");
    setEditandoNotas(true);
  }
  async function guardarNotas() {
    const r = await fetch(`/api/retiros/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notas: notasEdit || null }),
    });
    if (r.ok) { await fetchRetiro(true); setEditandoNotas(false); }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <header className="sf-header">
          <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}><i className="fas fa-bars" /></button>
          <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
        </header>
        <main className="sf-main"><div className="sf-container" style={{ textAlign: "center", padding: "4rem" }}><i className="fas fa-spinner fa-spin" style={{ fontSize: "1.75rem" }} /></div></main>
      </div>
    );
  }

  if (!retiro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <header className="sf-header">
          <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}><i className="fas fa-bars" /></button>
          <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
        </header>
        <main className="sf-main"><div className="sf-container"><div className="sf-empty"><i className="fas fa-box-open sf-empty-icon" /><p>Retiro no encontrado.</p></div></div></main>
      </div>
    );
  }

  const puedeCancelar = retiro.estado_retiro !== "retirado" && retiro.estado_retiro !== "cancelado";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}><i className="fas fa-bars" /></button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
      </header>

      <main className="sf-main">
        <div className="sf-container" style={{ maxWidth: 720 }}>
          <button className="sf-btn sf-btn-secondary" style={{ marginBottom: "1rem", padding: "0.35rem 0.7rem", fontSize: "0.8rem" }} onClick={() => router.push("/retiros")}>
            <i className="fas fa-arrow-left" /> Volver
          </button>

          {/* ── Cabecera grande, pensada para leerse de un vistazo en depósito ── */}
          <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "1.5rem", marginBottom: "1.5rem", background: "var(--surface-color)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cliente</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{retiro.cliente_nombre}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Retiro</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "monospace", color: "var(--primary-color)" }}>{retiro.codigo}</div>
              </div>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>Productos</div>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "1rem" }}>
                {retiro.productos_json.map((p, i) => (
                  <li key={i}>{p.nombre}{p.cantidad > 1 ? ` × ${p.cantidad}` : ""}</li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", borderRadius: "var(--radius)",
                background: `${ESTADO_PAGO_COLORS[retiro.estado_pago]}18`, border: `1px solid ${ESTADO_PAGO_COLORS[retiro.estado_pago]}55`,
              }}>
                <i className="fas fa-coins" style={{ color: ESTADO_PAGO_COLORS[retiro.estado_pago] }} />
                <span style={{ fontWeight: 800, fontSize: "1.05rem", color: ESTADO_PAGO_COLORS[retiro.estado_pago] }}>
                  {ESTADO_PAGO_LABELS[retiro.estado_pago]}
                </span>
                {retiro.estado_pago !== "pagado" && (
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmtMoney(Number(retiro.total))}</span>
                )}
                {retiro.medio_pago && (
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>· {MEDIOS_PAGO_LABELS[retiro.medio_pago] ?? retiro.medio_pago}</span>
                )}
              </div>
              <span className="sf-badge" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
                {ESTADO_RETIRO_LABELS[retiro.estado_retiro]}
              </span>
            </div>

            <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "1.25rem" }}>
              <span><i className="fas fa-calendar-day" /> Fecha estimada: <strong style={{ color: "var(--text-color)" }}>{fmtDate(retiro.fecha_estimada)}</strong>{" "}
                <button className="sf-icon-btn" title="Editar" onClick={abrirEditarFecha} style={{ padding: "0 4px" }}><i className="fas fa-pen" style={{ fontSize: "0.7rem" }} /></button>
              </span>
              {retiro.cliente_telefono && <span><i className="fas fa-phone" /> {retiro.cliente_telefono}</span>}
              {retiro.numero_pedido && <span><i className="fas fa-receipt" /> Pedido #{retiro.numero_pedido} ({CANAL_LABELS[retiro.canal_pedido ?? ""] ?? "—"})</span>}
            </div>

            {retiro.notas && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", padding: "0.6rem 0.8rem", background: "rgba(15,23,42,0.35)", borderRadius: "var(--radius)" }}>
                <i className="fas fa-note-sticky" style={{ marginRight: "0.4rem", color: "var(--text-muted)" }} /> {retiro.notas}
              </div>
            )}
            <button className="sf-btn sf-btn-secondary" style={{ marginTop: "0.6rem", padding: "0.3rem 0.6rem", fontSize: "0.75rem" }} onClick={abrirEditarNotas}>
              <i className="fas fa-pen" /> {retiro.notas ? "Editar notas" : "Agregar nota"}
            </button>
          </div>

          {error && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}><i className="fas fa-triangle-exclamation" /><span>{error}</span></div>
          )}

          {/* ── Acciones ─────────────────────────────────────────────────────── */}
          {retiro.estado_retiro !== "retirado" && retiro.estado_retiro !== "cancelado" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "1.5rem" }}>
              {retiro.estado_retiro === "pendiente_preparar" && (
                <button className="sf-btn" disabled={accionando} onClick={() => ejecutarAccion({ accion: "marcar_listo" })}>
                  <i className="fas fa-circle-check" /> Marcar listo para retirar
                </button>
              )}
              {retiro.estado_pago !== "pagado" && (
                <button className="sf-btn sf-btn-secondary" disabled={accionando} onClick={() => { setMedioPagoSeleccion(retiro.medio_pago ?? ""); setPidiendoMedioCobro(true); }}>
                  <i className="fas fa-coins" /> Registrar cobro
                </button>
              )}
              <button className="sf-btn" style={{ background: "var(--success-color)" }} disabled={accionando} onClick={onConfirmarEntregaClick}>
                <i className="fas fa-hand-holding-box" /> Confirmar entrega
              </button>
              {puedeSupervisar && puedeCancelar && (
                <button className="sf-btn sf-btn-secondary" disabled={accionando} onClick={() => {
                  const motivo = prompt("Motivo de la cancelación (opcional):");
                  if (motivo !== null) ejecutarAccion({ accion: "cancelar", motivo: motivo || null });
                }}>
                  <i className="fas fa-ban" /> Cancelar retiro
                </button>
              )}
            </div>
          )}

          {retiro.estado_retiro === "retirado" && (
            <div className="sf-alert sf-alert-ok" style={{ marginBottom: "1.5rem" }}>
              <i className="fas fa-circle-check" />
              <span>Entregado por {retiro.entregado_por} el {retiro.entregado_at ? fmtDateTime(retiro.entregado_at) : "—"}.</span>
            </div>
          )}
          {retiro.estado_retiro === "cancelado" && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1.5rem" }}>
              <i className="fas fa-ban" />
              <span>Cancelado el {retiro.cancelado_at ? fmtDateTime(retiro.cancelado_at) : "—"}{retiro.cancelado_motivo ? `: ${retiro.cancelado_motivo}` : ""}.</span>
            </div>
          )}

          {puedeSupervisar && (
            <button className="sf-btn sf-btn-secondary" style={{ marginBottom: "1.5rem", color: "var(--error-color)", padding: "0.35rem 0.7rem", fontSize: "0.8rem" }} disabled={accionando} onClick={eliminarRetiro}>
              <i className="fas fa-trash" /> Eliminar retiro (corregir carga errónea)
            </button>
          )}

          <hr className="sf-divider" />
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "1rem 0 0.75rem" }}>Historial</h2>
          <RetiroHistorial historial={retiro.historial} />
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>

      {/* ── ¿Se recibió el pago? (gate de Confirmar entrega) ────────────────── */}
      {pidiendoConfirmacionPago && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !accionando && setPidiendoConfirmacionPago(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(400px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title"><i className="fas fa-coins" style={{ color: "var(--warning-color)" }} /> ¿Se recibió el pago?</h3>
              <button className="sf-close-btn" onClick={() => !accionando && setPidiendoConfirmacionPago(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <p>Hay un saldo pendiente de <strong>{fmtMoney(Number(retiro.total))}</strong>. ¿Se cobró antes de entregar?</p>
              <label className="sf-label">Medio de pago (opcional)
                <select className="sf-input" value={medioPagoSeleccion} onChange={e => setMedioPagoSeleccion(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {MEDIOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <div className="sf-modal-footer" style={{ flexWrap: "wrap" }}>
              <button className="sf-btn sf-btn-secondary" disabled={accionando} onClick={() => setPidiendoConfirmacionPago(false)}>No entregar todavía</button>
              {puedeSupervisar && (
                <button className="sf-btn sf-btn-secondary" disabled={accionando} onClick={() => ejecutarAccion({ accion: "confirmar_entrega", overrideSupervisor: true })}>
                  <i className="fas fa-user-shield" /> Entregar con saldo pendiente
                </button>
              )}
              <button className="sf-btn" disabled={accionando} onClick={() => ejecutarAccion({ accion: "confirmar_entrega", pagoConfirmado: true, medioPago: medioPagoSeleccion || null })}>
                {accionando ? <><i className="fas fa-spinner fa-spin" /> Confirmando...</> : <><i className="fas fa-check" /> Sí, cobrado</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Medio de pago (Registrar cobro) ──────────────────────────────────── */}
      {pidiendoMedioCobro && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !accionando && setPidiendoMedioCobro(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(360px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title"><i className="fas fa-coins" style={{ color: "var(--primary-color)" }} /> Registrar cobro</h3>
              <button className="sf-close-btn" onClick={() => !accionando && setPidiendoMedioCobro(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              <label className="sf-label">Medio de pago (opcional)
                <select className="sf-input" value={medioPagoSeleccion} onChange={e => setMedioPagoSeleccion(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {MEDIOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" disabled={accionando} onClick={() => setPidiendoMedioCobro(false)}>Cancelar</button>
              <button
                className="sf-btn" disabled={accionando}
                onClick={async () => { const ok = await ejecutarAccion({ accion: "registrar_cobro", medioPago: medioPagoSeleccion || null }); if (ok) setPidiendoMedioCobro(false); }}
              >
                {accionando ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-check" /> Confirmar cobro</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Editar fecha estimada ────────────────────────────────────────────── */}
      {editandoFecha && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setEditandoFecha(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(340px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">Fecha estimada</h3>
              <button className="sf-close-btn" onClick={() => setEditandoFecha(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              <input className="sf-input" type="date" value={fechaEdit} onChange={e => setFechaEdit(e.target.value)} />
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setEditandoFecha(false)}>Cancelar</button>
              <button className="sf-btn" onClick={guardarFecha}>Guardar</button>
            </div>
          </div>
        </>
      )}

      {/* ── Editar notas ─────────────────────────────────────────────────────── */}
      {editandoNotas && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setEditandoNotas(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(420px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">Notas</h3>
              <button className="sf-close-btn" onClick={() => setEditandoNotas(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body">
              <textarea className="sf-input" rows={3} value={notasEdit} onChange={e => setNotasEdit(e.target.value)} style={{ resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setEditandoNotas(false)}>Cancelar</button>
              <button className="sf-btn" onClick={guardarNotas}>Guardar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
