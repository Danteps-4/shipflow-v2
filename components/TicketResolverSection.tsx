"use client";

import { useState } from "react";
import { ANDREANI_SUCURSALES } from "@/lib/andreaniData";

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

export interface CambioGeneradoUI {
  id: number;
  tipo: string;
  sucursal: string;
  direccion: string;
  numero_direccion: string;
  localidad: string;
  procesado: boolean;
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

// Qué tipo de costo sugerir por default cuando esta acción tiene un monto
// real, y si conviene sugerir sumarlo como costo del ticket por default.
// `null` = esta acción no representa un costo real (link de pago, resolver
// sin costo), no se muestra el checkbox.
const COSTO_SUGERIDO: Record<string, { tipo: string; checked: boolean } | null> = {
  enviar_producto: { tipo: "producto_enviado", checked: true },
  cambiar_producto: { tipo: "producto_enviado", checked: true },
  crear_pedido: { tipo: "otro", checked: false },
  modificar_pedido: { tipo: "otro", checked: false },
  cambiar_direccion: { tipo: "otro", checked: false },
  generar_devolucion: { tipo: "devolucion", checked: true },
  reembolso: { tipo: "reembolso", checked: true },
  cancelar_pedido: { tipo: "otro", checked: false },
  reenviar_pedido: { tipo: "envio", checked: true },
  generar_link_pago: null,
  resolver_sin_costo: null,
  otra_accion: { tipo: "otro", checked: false },
};

const TIPOS_COSTO_LABELS: Record<string, string> = {
  producto_enviado: "Producto enviado",
  envio: "Envío",
  devolucion: "Devolución",
  reembolso: "Reembolso",
  otro: "Otro",
};

// Acciones que típicamente implican mandarle algo físico al cliente — para
// estas se ofrece generar directamente un Cambio real (módulo Cambios), que
// después se procesa y se paga con Andreani como cualquier otro envío.
const REQUIERE_ENVIO = ["enviar_producto", "cambiar_producto", "crear_pedido", "reenviar_pedido"];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface TicketCliente {
  nombre: string;
  telefono: string | null;
  email: string | null;
  dni: string | null;
  direccion: string | null;
}

export default function TicketResolverSection({
  ticketId, acciones, onRegistrada, puedeSupervisar, ticketCliente, ticketNumeroPedido, cambiosGenerados,
}: {
  ticketId: number;
  acciones: TicketAccionUI[];
  onRegistrada: () => void;
  puedeSupervisar: boolean;
  ticketCliente: TicketCliente;
  ticketNumeroPedido: string;
  cambiosGenerados: CambioGeneradoUI[];
}) {
  const [formTipo, setFormTipo] = useState<string | null>(null);
  const [editingAccionId, setEditingAccionId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState("");
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [agregarComoCosto, setAgregarComoCosto] = useState(false);
  const [costoTipo, setCostoTipo] = useState("otro");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [generarEnvio, setGenerarEnvio] = useState(false);
  const [envioTipo, setEnvioTipo] = useState<"domicilio" | "sucursal">("domicilio");
  const [envioNombre, setEnvioNombre] = useState("");
  const [envioTelefono, setEnvioTelefono] = useState("");
  const [envioEmail, setEnvioEmail] = useState("");
  const [envioDni, setEnvioDni] = useState("");
  const [envioDireccion, setEnvioDireccion] = useState("");
  const [envioNumeroDireccion, setEnvioNumeroDireccion] = useState("");
  const [envioPiso, setEnvioPiso] = useState("");
  const [envioLocalidad, setEnvioLocalidad] = useState("");
  const [envioProvincia, setEnvioProvincia] = useState("");
  const [envioCodigoPostal, setEnvioCodigoPostal] = useState("");
  const [envioSucursal, setEnvioSucursal] = useState("");

  function abrirForm(tipo: string) {
    setFormTipo(tipo);
    setEditingAccionId(null);
    setDetalle("");
    setMonto("");
    setReferencia("");
    const sugerido = COSTO_SUGERIDO[tipo];
    setAgregarComoCosto(sugerido?.checked ?? false);
    setCostoTipo(sugerido?.tipo ?? "otro");

    setGenerarEnvio(REQUIERE_ENVIO.includes(tipo));
    setEnvioTipo("domicilio");
    setEnvioNombre(ticketCliente.nombre || "");
    setEnvioTelefono(ticketCliente.telefono || "");
    setEnvioEmail(ticketCliente.email || "");
    setEnvioDni(ticketCliente.dni || "");
    setEnvioDireccion(ticketCliente.direccion || "");
    setEnvioNumeroDireccion("");
    setEnvioPiso("");
    setEnvioLocalidad("");
    setEnvioProvincia("");
    setEnvioCodigoPostal("");
    setEnvioSucursal("");
  }

  function abrirEdicion(a: TicketAccionUI) {
    setFormTipo(a.tipo);
    setEditingAccionId(a.id);
    setDetalle(a.detalle ?? "");
    setMonto(a.monto ?? "");
    setReferencia(a.referencia ?? "");
    setAgregarComoCosto(false);
    setGenerarEnvio(false);
  }

  function cerrarForm() {
    setFormTipo(null);
    setEditingAccionId(null);
  }

  async function guardar() {
    if (!formTipo) return;
    if (!editingAccionId && REQUIERE_ENVIO.includes(formTipo) && generarEnvio) {
      if (!envioNombre.trim() || !envioTelefono.trim()) { alert("Faltan nombre y teléfono del envío"); return; }
      if (envioTipo === "sucursal" && !envioSucursal.trim()) { alert("Falta la sucursal"); return; }
      if (envioTipo === "domicilio" && (!envioDireccion.trim() || !envioNumeroDireccion.trim())) { alert("Falta calle y número"); return; }
    }
    setSaving(true);
    try {
      if (editingAccionId) {
        const res = await fetch(`/api/tickets/${ticketId}/actions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accionId: editingAccionId,
            detalle: detalle.trim() || null,
            monto: monto.trim() ? Number(monto) : null,
            referencia: referencia.trim() || null,
          }),
        });
        if (res.ok) { cerrarForm(); onRegistrada(); }
      } else {
        const envioAplica = REQUIERE_ENVIO.includes(formTipo) && generarEnvio;
        const res = await fetch(`/api/tickets/${ticketId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: formTipo,
            detalle: detalle.trim() || null,
            monto: monto.trim() ? Number(monto) : null,
            referencia: referencia.trim() || null,
            agregarComoCosto: !!COSTO_SUGERIDO[formTipo] && agregarComoCosto && !!monto.trim(),
            costoTipo,
            ...(envioAplica ? {
              generarEnvio: true,
              envioTipo,
              envioNombre: envioNombre.trim(),
              envioTelefono: envioTelefono.trim(),
              envioEmail: envioEmail.trim() || undefined,
              envioDni: envioDni.trim() || undefined,
              envioDireccion, envioNumeroDireccion, envioPiso, envioLocalidad, envioProvincia, envioCodigoPostal,
              envioSucursal,
              numeroPedidoOriginal: ticketNumeroPedido,
            } : {}),
          }),
        });
        if (res.ok) { cerrarForm(); onRegistrada(); }
        else { const d = await res.json().catch(() => null); alert(d?.error ?? "No se pudo registrar"); }
      }
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(accionId: number) {
    if (!confirm("¿Eliminar esta acción registrada?")) return;
    setDeletingId(accionId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/actions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accionId }),
      });
      if (res.ok) onRegistrada();
    } finally {
      setDeletingId(null);
    }
  }

  const mostrarCheckboxCosto = !editingAccionId && formTipo && COSTO_SUGERIDO[formTipo] && monto.trim();
  const mostrarEnvio = !editingAccionId && formTipo && REQUIERE_ENVIO.includes(formTipo);

  return (
    <div>
      <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
        <div className="sf-step-badge"><i className="fas fa-wrench" style={{ fontSize: "0.65rem" }} /></div>
        <div>
          <h2>Resolver ticket</h2>
          <p>Registrá qué se hizo — por ahora es manual, ninguna acción ejecuta nada automáticamente.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
        {TIPOS_ACCION.map(tipo => (
          <button key={tipo} className="sf-btn sf-btn-secondary" style={{ fontSize: "0.78rem" }} onClick={() => abrirForm(tipo)}>
            <i className={TIPOS_ACCION_LABELS[tipo].icon} /> {TIPOS_ACCION_LABELS[tipo].label}
          </button>
        ))}
      </div>

      {acciones.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
          {acciones.map(a => (
            <div key={a.id} style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
                <strong><i className={TIPOS_ACCION_LABELS[a.tipo]?.icon ?? "fas fa-ellipsis"} style={{ marginRight: "0.4rem", color: "var(--primary-color)" }} />{TIPOS_ACCION_LABELS[a.tipo]?.label ?? a.tipo}</strong>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{a.created_by} · {fmtDateTime(a.created_at)}</span>
                  <button className="sf-icon-btn" title="Editar acción" onClick={() => abrirEdicion(a)} style={{ width: 24, height: 24, fontSize: "0.68rem" }}>
                    <i className="fas fa-pen" />
                  </button>
                  {puedeSupervisar && (
                    <button
                      className="sf-icon-btn" title="Eliminar acción" onClick={() => eliminar(a.id)}
                      disabled={deletingId === a.id} style={{ width: 24, height: 24, fontSize: "0.68rem", color: "var(--danger-color, #ef4444)" }}
                    >
                      {deletingId === a.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
                    </button>
                  )}
                </div>
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

      {cambiosGenerados.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
            Envíos generados para Andreani
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {cambiosGenerados.map(c => (
              <a
                key={c.id} href="/cambios" target="_blank" rel="noopener noreferrer"
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem",
                  border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.45rem 0.7rem",
                  fontSize: "0.8rem", color: "var(--text-color)", textDecoration: "none",
                }}
              >
                <span>
                  <i className={c.tipo === "sucursal" ? "fas fa-store" : "fas fa-house"} style={{ marginRight: "0.4rem", color: "var(--primary-color)" }} />
                  {c.tipo === "sucursal" ? c.sucursal : `${c.direccion} ${c.numero_direccion}, ${c.localidad}`}
                </span>
                <span className={`sf-badge ${c.procesado ? "" : "sf-badge-warning"}`}>{c.procesado ? "Procesado" : "Pendiente"}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {formTipo && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !saving && cerrarForm()} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className={TIPOS_ACCION_LABELS[formTipo].icon} style={{ color: "var(--primary-color)" }} />
                {editingAccionId ? "Editar acción — " : ""}{TIPOS_ACCION_LABELS[formTipo].label}
              </h3>
              <button className="sf-close-btn" onClick={cerrarForm}><i className="fas fa-times" /></button>
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
              {mostrarCheckboxCosto && (
                <div style={{ border: "1px dashed var(--border-color)", borderRadius: "var(--radius)", padding: "0.6rem 0.7rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={agregarComoCosto} onChange={e => setAgregarComoCosto(e.target.checked)} />
                    Sumar este monto a los costos del ticket
                  </label>
                  {agregarComoCosto && (
                    <label className="sf-label" style={{ marginBottom: 0 }}>
                      Tipo de costo
                      <select className="sf-input" value={costoTipo} onChange={e => setCostoTipo(e.target.value)}>
                        {Object.entries(TIPOS_COSTO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {mostrarEnvio && (
                <div style={{ border: "1px dashed var(--border-color)", borderRadius: "var(--radius)", padding: "0.6rem 0.7rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={generarEnvio} onChange={e => setGenerarEnvio(e.target.checked)} />
                    Generar envío para Andreani (se guarda en Cambios para procesar y pagar después)
                  </label>
                  {generarEnvio && (
                    <>
                      <div className="ticket-field-grid">
                        <label className="sf-label">
                          Nombre
                          <input className="sf-input" value={envioNombre} onChange={e => setEnvioNombre(e.target.value)} />
                        </label>
                        <label className="sf-label">
                          Teléfono
                          <input className="sf-input" value={envioTelefono} onChange={e => setEnvioTelefono(e.target.value)} />
                        </label>
                      </div>
                      <div className="ticket-field-grid">
                        <label className="sf-label">
                          Email (opcional)
                          <input className="sf-input" value={envioEmail} onChange={e => setEnvioEmail(e.target.value)} />
                        </label>
                        <label className="sf-label">
                          DNI (opcional)
                          <input className="sf-input" value={envioDni} onChange={e => setEnvioDni(e.target.value)} />
                        </label>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {(["domicilio", "sucursal"] as const).map(t => (
                          <button
                            key={t} type="button" onClick={() => setEnvioTipo(t)}
                            style={{
                              flex: 1, padding: "0.4rem", borderRadius: "var(--radius)", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem",
                              border: `1px solid ${envioTipo === t ? "var(--primary-color)" : "var(--border-color)"}`,
                              background: envioTipo === t ? "var(--primary-color)" : "transparent",
                              color: envioTipo === t ? "#fff" : "var(--text-muted)",
                            }}
                          >
                            {t === "sucursal" ? "A sucursal" : "A domicilio"}
                          </button>
                        ))}
                      </div>

                      {envioTipo === "sucursal" ? (
                        <label className="sf-label">
                          Sucursal
                          <input
                            className="sf-input" value={envioSucursal} onChange={e => setEnvioSucursal(e.target.value)}
                            list="sucursales-list-ticket" placeholder="Ej: PALERMO (AV SCALABRINI ORTIZ)"
                          />
                          <datalist id="sucursales-list-ticket">
                            {ANDREANI_SUCURSALES.map(s => <option key={s} value={s} />)}
                          </datalist>
                        </label>
                      ) : (
                        <>
                          <div className="ticket-field-grid">
                            <label className="sf-label">
                              Calle
                              <input className="sf-input" value={envioDireccion} onChange={e => setEnvioDireccion(e.target.value)} />
                            </label>
                            <label className="sf-label">
                              Número
                              <input className="sf-input" value={envioNumeroDireccion} onChange={e => setEnvioNumeroDireccion(e.target.value)} />
                            </label>
                          </div>
                          <div className="ticket-field-grid">
                            <label className="sf-label">
                              Piso (opcional)
                              <input className="sf-input" value={envioPiso} onChange={e => setEnvioPiso(e.target.value)} />
                            </label>
                            <label className="sf-label">
                              Localidad
                              <input className="sf-input" value={envioLocalidad} onChange={e => setEnvioLocalidad(e.target.value)} />
                            </label>
                            <label className="sf-label">
                              CP
                              <input className="sf-input" value={envioCodigoPostal} onChange={e => setEnvioCodigoPostal(e.target.value)} />
                            </label>
                          </div>
                          <label className="sf-label">
                            Provincia
                            <input className="sf-input" value={envioProvincia} onChange={e => setEnvioProvincia(e.target.value)} />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={cerrarForm} disabled={saving}>Cancelar</button>
              <button className="sf-btn" onClick={guardar} disabled={saving}>
                {saving ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-check" /> {editingAccionId ? "Guardar cambios" : "Registrar"}</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
