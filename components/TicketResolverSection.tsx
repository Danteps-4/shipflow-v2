"use client";

import { useState } from "react";

export interface TicketAccionUI {
  id: number;
  tipo: string;
  detalle: string | null;
  monto: string | null;
  referencia: string | null;
  estado: string;
  created_by: string;
  created_at: string;
}

const TIPOS_ACCION_LABELS: Record<string, { label: string; icon: string }> = {
  enviar_producto: { label: "Enviar producto", icon: "fas fa-box" },
  cambiar_producto: { label: "Cambiar producto", icon: "fas fa-right-left" },
  crear_pedido: { label: "Crear nuevo pedido", icon: "fas fa-plus" },
  modificar_pedido: { label: "Modificar pedido", icon: "fas fa-pen" },
  cambiar_direccion: { label: "Cambiar dirección", icon: "fas fa-map-pin" },
  generar_devolucion: { label: "Generar devolución", icon: "fas fa-truck-ramp-box" },
  reembolso: { label: "Reembolso", icon: "fas fa-money-bill-transfer" },
  cancelar_pedido: { label: "Cancelar pedido", icon: "fas fa-ban" },
  reenviar_pedido: { label: "Reenviar pedido", icon: "fas fa-truck" },
  generar_link_pago: { label: "Generar link de pago", icon: "fas fa-link" },
  resolver_sin_costo: { label: "Resolver sin costo", icon: "fas fa-check" },
  otra_accion: { label: "Otra acción", icon: "fas fa-ellipsis" },
};
const TIPOS_ACCION = Object.keys(TIPOS_ACCION_LABELS);

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TicketResolverSection({
  ticketId, acciones, onRegistrada,
}: {
  ticketId: number;
  acciones: TicketAccionUI[];
  onRegistrada: () => void;
}) {
  const [formTipo, setFormTipo] = useState<string | null>(null);
  const [detalle, setDetalle] = useState("");
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [saving, setSaving] = useState(false);

  function abrirForm(tipo: string) {
    setFormTipo(tipo);
    setDetalle("");
    setMonto("");
    setReferencia("");
  }

  async function guardar() {
    if (!formTipo) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: formTipo,
          detalle: detalle.trim() || null,
          monto: monto.trim() ? Number(monto) : null,
          referencia: referencia.trim() || null,
        }),
      });
      if (res.ok) {
        setFormTipo(null);
        onRegistrada();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
        <div className="sf-step-badge"><i className="fas fa-wrench" style={{ fontSize: "0.65rem" }} /></div>
        <div>
          <h2>Resolver ticket</h2>
          <p>Registrá qué se hizo — por ahora es manual, ninguna acción ejecuta nada automáticamente.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
        {TIPOS_ACCION.map(tipo => (
          <button key={tipo} className="sf-btn sf-btn-secondary" style={{ fontSize: "0.8rem" }} onClick={() => abrirForm(tipo)}>
            <i className={TIPOS_ACCION_LABELS[tipo].icon} /> {TIPOS_ACCION_LABELS[tipo].label}
          </button>
        ))}
      </div>

      {acciones.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
          {acciones.map(a => (
            <div key={a.id} style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <strong><i className={TIPOS_ACCION_LABELS[a.tipo]?.icon ?? "fas fa-ellipsis"} style={{ marginRight: "0.4rem", color: "var(--primary-color)" }} />{TIPOS_ACCION_LABELS[a.tipo]?.label ?? a.tipo}</strong>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{a.created_by} · {fmtDateTime(a.created_at)}</span>
              </div>
              {a.detalle && <p style={{ marginTop: "0.3rem", color: "var(--text-muted)" }}>{a.detalle}</p>}
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.3rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {a.monto && <span><i className="fas fa-coins" /> ${Number(a.monto).toLocaleString("es-AR")}</span>}
                {a.referencia && <span><i className="fas fa-link" /> {a.referencia}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {formTipo && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !saving && setFormTipo(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(440px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className={TIPOS_ACCION_LABELS[formTipo].icon} style={{ color: "var(--primary-color)" }} />
                {TIPOS_ACCION_LABELS[formTipo].label}
              </h3>
              <button className="sf-close-btn" onClick={() => setFormTipo(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                <i className="fas fa-circle-info" style={{ marginRight: "0.3rem" }} />
                Se registra manualmente en el historial — todavía no ejecuta la acción.
              </p>
              <label className="sf-label">
                Detalle
                <textarea className="sf-input" rows={3} value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Qué se hizo..." style={{ resize: "vertical", fontFamily: "inherit" }} autoFocus />
              </label>
              <label className="sf-label">
                Monto (opcional)
                <input className="sf-input" type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" />
              </label>
              <label className="sf-label">
                Referencia (opcional)
                <input className="sf-input" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Link, tracking, N° de pedido nuevo..." />
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setFormTipo(null)} disabled={saving}>Cancelar</button>
              <button className="sf-btn" onClick={guardar} disabled={saving}>
                {saving ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-check" /> Registrar</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
