"use client";

import { useState, useEffect, useCallback } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

const ESTADOS_LABELS: Record<string, string> = {
  PENDING: "Procesando",
  AUTO_MATCHED: "Matcheada",
  REQUIRES_REVIEW: "Requiere revisión",
  UNMATCHED: "Sin coincidencia",
  CONFIRMED: "Conciliada",
  DUPLICATE_IGNORED: "Descartada",
  ERROR: "Error",
};
const ESTADO_COLORS: Record<string, string> = {
  PENDING: "#94a3b8",
  AUTO_MATCHED: "#3b82f6",
  REQUIRES_REVIEW: "#f59e0b",
  UNMATCHED: "#94a3b8",
  CONFIRMED: "#22c55e",
  DUPLICATE_IGNORED: "#64748b",
  ERROR: "#ef4444",
};

interface TransferenciaBancaria {
  id: number;
  transaction_id: string;
  sender_name: string | null;
  detected_dni: string | null;
  cuit_cuil: string | null;
  bank_account: string | null;
  amount_cents: string;
  received_at: string | null;
  original_message: string;
  estado: string;
  matched_order_id: string | null;
  matched_order_number: string | null;
  order_amount_cents: string | null;
  amount_difference_cents: string | null;
  match_dni: boolean | null;
  match_amount: boolean | null;
  match_name: boolean | null;
  match_method: boolean | null;
  candidates_json: { orderNumber: string; matchDni: boolean; matchAmount: boolean; matchName: boolean }[] | null;
  created_at: string;
}

interface AuditoriaEvento {
  id: number;
  evento: string;
  detalle_json: unknown;
  created_at: string;
}

interface Me { role: "admin" | "member" }

function fmtPesos(cents: string | number | null): string {
  if (cents === null) return "—";
  return "$" + (Number(cents) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ConciliacionTransferenciasPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const [transferencias, setTransferencias] = useState<TransferenciaBancaria[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [autoConfirmEnabled, setAutoConfirmEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroDni, setFiltroDni] = useState("");
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroPedido, setFiltroPedido] = useState("");
  const [filtroTransactionId, setFiltroTransactionId] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [seleccionada, setSeleccionada] = useState<TransferenciaBancaria | null>(null);
  const [auditoria, setAuditoria] = useState<AuditoriaEvento[]>([]);
  const [numeroBusqueda, setNumeroBusqueda] = useState("");
  const [accionando, setAccionando] = useState(false);
  const [confirmacion, setConfirmacion] = useState<{ texto: string; onOk: () => void } | null>(null);

  useEffect(() => {
    fetch("/api/user/me").then(r => r.json()).then(d => setMe(d.user ?? null)).catch(() => {});
  }, []);

  const fetchLista = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set("estado", filtroEstado);
      if (filtroDni) params.set("dni", filtroDni);
      if (filtroNombre) params.set("nombre", filtroNombre);
      if (filtroPedido) params.set("pedido", filtroPedido);
      if (filtroTransactionId) params.set("transaction_id", filtroTransactionId);
      if (fechaDesde) params.set("fecha_desde", fechaDesde);
      if (fechaHasta) params.set("fecha_hasta", fechaHasta);
      const r = await fetch(`/api/finanzas/conciliacion?${params}`);
      if (r.ok) {
        const d = await r.json();
        setTransferencias(d.transferencias ?? []);
        setKpis(d.kpis ?? {});
        setAutoConfirmEnabled(!!d.autoConfirmEnabled);
      }
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroDni, filtroNombre, filtroPedido, filtroTransactionId, fechaDesde, fechaHasta]);

  useEffect(() => { fetchLista(); }, [fetchLista]);

  async function abrirDetalle(t: TransferenciaBancaria) {
    setSeleccionada(t);
    setNumeroBusqueda("");
    const r = await fetch(`/api/finanzas/conciliacion/${t.id}`);
    if (r.ok) {
      const d = await r.json();
      setAuditoria(d.auditoria ?? []);
    }
  }

  function cerrarDetalle() {
    setSeleccionada(null);
    setAuditoria([]);
  }

  async function toggleAutoConfirm() {
    const nuevo = !autoConfirmEnabled;
    const r = await fetch("/api/finanzas/conciliacion/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nuevo }),
    });
    if (r.ok) setAutoConfirmEnabled(nuevo);
    else alert((await r.json().catch(() => null))?.error ?? "No se pudo cambiar");
  }

  function pedirConfirmacion(texto: string, onOk: () => void) {
    setConfirmacion({ texto, onOk });
  }

  async function confirmarPago(id: number) {
    setAccionando(true);
    try {
      const r = await fetch(`/api/finanzas/conciliacion/${id}/confirmar`, { method: "POST" });
      if (r.ok) {
        cerrarDetalle();
        fetchLista();
      } else {
        alert((await r.json().catch(() => null))?.error ?? "No se pudo confirmar");
      }
    } finally {
      setAccionando(false);
    }
  }

  async function vincularPedido(id: number, orderNumber: string) {
    setAccionando(true);
    try {
      const r = await fetch(`/api/finanzas/conciliacion/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "vincular", orderNumber }),
      });
      if (r.ok) {
        cerrarDetalle();
        fetchLista();
      } else {
        alert((await r.json().catch(() => null))?.error ?? "No se pudo vincular");
      }
    } finally {
      setAccionando(false);
    }
  }

  async function descartar(id: number) {
    setAccionando(true);
    try {
      const r = await fetch(`/api/finanzas/conciliacion/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "descartar" }),
      });
      if (r.ok) {
        cerrarDetalle();
        fetchLista();
      } else {
        alert((await r.json().catch(() => null))?.error ?? "No se pudo descartar");
      }
    } finally {
      setAccionando(false);
    }
  }

  const kpiConciliadas = kpis.CONFIRMED ?? 0;
  const kpiRevision = (kpis.REQUIRES_REVIEW ?? 0) + (kpis.AUTO_MATCHED ?? 0);
  const kpiSinCoincidencia = kpis.UNMATCHED ?? 0;
  const kpiError = kpis.ERROR ?? 0;

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Conciliación de transferencias</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Detecta avisos de ingresos por Telegram y los matchea contra pedidos pendientes de pago en Tiendanube.
              </p>
            </div>
            {me?.role === "admin" && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.5rem 0.75rem" }}>
                <input type="checkbox" checked={autoConfirmEnabled} onChange={toggleAutoConfirm} />
                Acciones habilitadas {autoConfirmEnabled ? <span style={{ color: "var(--success-color)" }}>(ON)</span> : <span style={{ color: "var(--text-muted)" }}>(modo observación)</span>}
              </label>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
            {[
              { label: "Conciliadas hoy", value: kpiConciliadas, icon: "fa-circle-check", color: "#22c55e" },
              { label: "Requieren revisión / confirmar", value: kpiRevision, icon: "fa-triangle-exclamation", color: "#f59e0b" },
              { label: "Sin coincidencia", value: kpiSinCoincidencia, icon: "fa-circle-question", color: "#94a3b8" },
              { label: "Error", value: kpiError, icon: "fa-circle-xmark", color: "#ef4444" },
            ].map(k => (
              <div key={k.label} style={{ flex: "1 1 180px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.85rem", background: "rgba(15,23,42,0.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: k.color, marginBottom: "0.3rem" }}>
                  <i className={`fas ${k.icon}`} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>{k.label}</span>
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <select className="sf-input" style={{ maxWidth: 190 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input className="sf-input" style={{ maxWidth: 150 }} placeholder="DNI" value={filtroDni} onChange={e => setFiltroDni(e.target.value)} />
            <input className="sf-input" style={{ maxWidth: 180 }} placeholder="Nombre" value={filtroNombre} onChange={e => setFiltroNombre(e.target.value)} />
            <input className="sf-input" style={{ maxWidth: 150 }} placeholder="N° de pedido" value={filtroPedido} onChange={e => setFiltroPedido(e.target.value)} />
            <input className="sf-input" style={{ maxWidth: 220 }} placeholder="ID de transacción" value={filtroTransactionId} onChange={e => setFiltroTransactionId(e.target.value)} />
            <input className="sf-input" style={{ maxWidth: 150 }} type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} title="Desde" />
            <input className="sf-input" style={{ maxWidth: 150 }} type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} title="Hasta" />
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
            </div>
          ) : transferencias.length === 0 ? (
            <div className="sf-empty">
              <i className="fas fa-money-bill-transfer sf-empty-icon" />
              <p style={{ fontWeight: 600, color: "var(--text-muted)" }}>No hay transferencias para este filtro</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="sf-table">
                <thead>
                  <tr>
                    <th>Hora</th><th>Cliente</th><th>DNI</th><th>Transferencia</th>
                    <th>Pedido</th><th>Importe pedido</th><th>Diferencia</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {transferencias.map(t => (
                    <tr key={t.id} onClick={() => abrirDetalle(t)} style={{ cursor: "pointer" }}>
                      <td>{fmtHora(t.created_at)}</td>
                      <td>{t.sender_name || "—"}</td>
                      <td style={{ fontFamily: "monospace" }}>{t.detected_dni || "—"}</td>
                      <td style={{ fontFamily: "monospace" }}>{fmtPesos(t.amount_cents)}</td>
                      <td>{t.matched_order_number ? `#${t.matched_order_number}` : "—"}</td>
                      <td style={{ fontFamily: "monospace" }}>{fmtPesos(t.order_amount_cents)}</td>
                      <td style={{ fontFamily: "monospace" }}>{fmtPesos(t.amount_difference_cents)}</td>
                      <td>
                        <span className="sf-badge" style={{ background: (ESTADO_COLORS[t.estado] ?? "#94a3b8") + "22", color: ESTADO_COLORS[t.estado] ?? "#94a3b8", border: `1px solid ${ESTADO_COLORS[t.estado] ?? "#94a3b8"}44` }}>
                          {ESTADOS_LABELS[t.estado] ?? t.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
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

      {/* Modal de detalle */}
      {seleccionada && (
        <>
          <div className="sf-modal-backdrop" onClick={cerrarDetalle} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(560px, calc(100vw - 2rem))", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title"><i className="fas fa-money-bill-transfer" style={{ color: "var(--primary-color)" }} /> Transferencia #{seleccionada.id}</h3>
              <button className="sf-close-btn" onClick={cerrarDetalle}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="sf-info-block">
                <div className="sf-info-block-title">Transferencia</div>
                <div className="sf-info-block-grid">
                  <div><strong>Monto:</strong> {fmtPesos(seleccionada.amount_cents)}</div>
                  <div><strong>Nombre:</strong> {seleccionada.sender_name || "—"}</div>
                  <div><strong>CUIL:</strong> {seleccionada.cuit_cuil || "—"}</div>
                  <div><strong>DNI detectado:</strong> {seleccionada.detected_dni || "—"}</div>
                  <div><strong>CBU/CVU:</strong> {seleccionada.bank_account || "—"}</div>
                  <div><strong>ID Transacción:</strong> {seleccionada.transaction_id}</div>
                  <div style={{ gridColumn: "1 / -1" }}><strong>Fecha/hora:</strong> {seleccionada.received_at ? fmtHora(seleccionada.received_at) : "—"}</div>
                </div>
                <details style={{ marginTop: "0.5rem" }}>
                  <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--text-muted)" }}>Ver mensaje original</summary>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.78rem", marginTop: "0.4rem", color: "var(--text-muted)" }}>{seleccionada.original_message}</pre>
                </details>
              </div>

              {seleccionada.matched_order_number && (
                <div className="sf-info-block">
                  <div className="sf-info-block-title">Matching — Pedido #{seleccionada.matched_order_number}</div>
                  <div className="sf-info-block-grid">
                    <div>DNI {seleccionada.match_dni ? "✅ Exacto" : "❌"}</div>
                    <div>Monto {seleccionada.match_amount ? `✅ diferencia ${fmtPesos(seleccionada.amount_difference_cents)}` : "❌"}</div>
                    <div>Nombre {seleccionada.match_name ? "✅ Coincide" : "—"}</div>
                    <div>Método {seleccionada.match_method ? "✅ Transferencia" : "❌"}</div>
                  </div>
                </div>
              )}

              {seleccionada.estado === "REQUIRES_REVIEW" && seleccionada.candidates_json && seleccionada.candidates_json.length > 0 && (
                <div className="sf-info-block">
                  <div className="sf-info-block-title">Candidatos posibles</div>
                  {seleccionada.candidates_json.map(c => (
                    <div key={c.orderNumber} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.85rem" }}>
                      <span>Pedido #{c.orderNumber}</span>
                      <span>
                        {c.matchDni && <span className="sf-badge" style={{ marginRight: "0.3rem" }}>DNI</span>}
                        {c.matchAmount && <span className="sf-badge" style={{ marginRight: "0.3rem" }}>Monto</span>}
                        {c.matchName && <span className="sf-badge">Nombre</span>}
                      </span>
                      <button className="sf-btn sf-btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }} disabled={accionando}
                        onClick={() => pedirConfirmacion(`Vas a vincular el pedido #${c.orderNumber} con esta transferencia.`, () => vincularPedido(seleccionada.id, c.orderNumber))}>
                        Elegir
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {seleccionada.estado === "AUTO_MATCHED" && (
                  <>
                    <a
                      className="sf-btn sf-btn-secondary" target="_blank" rel="noopener noreferrer"
                      href={`https://www.tiendanube.com/admin/v2/orders/${seleccionada.matched_order_id}`}
                    >
                      <i className="fas fa-arrow-up-right-from-square" /> Abrir pedido en Tiendanube
                    </a>
                    <button className="sf-btn" disabled={accionando}
                      onClick={() => pedirConfirmacion(`Vas a marcar como conciliada la transferencia de ${fmtPesos(seleccionada.amount_cents)} usando el pedido #${seleccionada.matched_order_number}. Asegurate de haberlo marcado pagado en Tiendanube primero.`, () => confirmarPago(seleccionada.id))}>
                      <i className="fas fa-check" /> Ya lo marqué pagado en Tiendanube
                    </button>
                  </>
                )}

                {(seleccionada.estado === "REQUIRES_REVIEW" || seleccionada.estado === "UNMATCHED") && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <input className="sf-input" style={{ maxWidth: 160 }} placeholder="N° de pedido" value={numeroBusqueda} onChange={e => setNumeroBusqueda(e.target.value)} />
                    <button className="sf-btn sf-btn-secondary" disabled={accionando || !numeroBusqueda.trim()}
                      onClick={() => pedirConfirmacion(`Vas a vincular el pedido #${numeroBusqueda.trim()} con esta transferencia.`, () => vincularPedido(seleccionada.id, numeroBusqueda.trim()))}>
                      Vincular pedido
                    </button>
                  </div>
                )}

                {!["CONFIRMED", "DUPLICATE_IGNORED"].includes(seleccionada.estado) && (
                  <button className="sf-btn sf-btn-secondary" disabled={accionando}
                    onClick={() => pedirConfirmacion("Vas a descartar esta transferencia — no va a quedar vinculada a ningún pedido.", () => descartar(seleccionada.id))}>
                    <i className="fas fa-ban" /> Descartar
                  </button>
                )}
              </div>

              <div>
                <div className="sf-info-block-title" style={{ marginBottom: "0.4rem" }}>Historial</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {auditoria.map(a => (
                    <div key={a.id} style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {fmtHora(a.created_at)} — {a.evento}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmación genérico para acciones */}
      {confirmacion && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setConfirmacion(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(420px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title"><i className="fas fa-triangle-exclamation" style={{ color: "var(--warning-color)" }} /> Confirmar acción</h3>
              <button className="sf-close-btn" onClick={() => setConfirmacion(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body"><p>{confirmacion.texto}</p></div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setConfirmacion(null)}>Cancelar</button>
              <button className="sf-btn" onClick={() => { const fn = confirmacion.onOk; setConfirmacion(null); fn(); }}>Confirmar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
