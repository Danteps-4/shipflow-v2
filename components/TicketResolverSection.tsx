"use client";

import { useRef, useState } from "react";
import { ANDREANI_SUCURSALES } from "@/lib/andreaniData";

export interface ComprobanteUI {
  id: number;
  cambio_id: number | null;
  url: string;
  resource_type: string;
  nombre_archivo: string | null;
}

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
  nombre: string;
  telefono: string;
  email: string | null;
  dni: string | null;
  motivo: string | null;
  numero_pedido_original: string | null;
  sucursal: string;
  direccion: string;
  numero_direccion: string;
  piso: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  sku: string | null;
  tracking: string | null;
  procesado: boolean;
  created_at: string;
}

export interface EnvioOverrideUI {
  tipo: string | null;
  direccion: string | null;
  numeroDireccion: string | null;
  piso: string | null;
  localidad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  sucursal: string | null;
}

const TIPOS_ACCION_LABELS: Record<string, { label: string; icon: string }> = {
  generar_envio: { label: "Generar nuevo envío", icon: "fas fa-box" },
  producto_faltante: { label: "Producto faltante", icon: "fas fa-box-open" },
  modificar_pedido: { label: "Modificar pedido", icon: "fas fa-pen" },
  cambiar_direccion: { label: "Cambio de dirección/sucursal", icon: "fas fa-map-pin" },
  generar_devolucion: { label: "Generar devolución", icon: "fas fa-truck-ramp-box" },
  reembolso: { label: "Reembolso", icon: "fas fa-money-bill-transfer" },
  cancelar_pedido: { label: "Cancelar pedido", icon: "fas fa-ban" },
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
  generar_envio: { tipo: "producto_enviado", checked: true },
  producto_faltante: { tipo: "producto_enviado", checked: true },
  modificar_pedido: { tipo: "otro", checked: false },
  cambiar_direccion: { tipo: "otro", checked: false },
  generar_devolucion: { tipo: "devolucion", checked: true },
  reembolso: { tipo: "reembolso", checked: true },
  cancelar_pedido: { tipo: "otro", checked: false },
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

interface DestinoState {
  tipo: "domicilio" | "sucursal";
  direccion: string; numeroDireccion: string; piso: string; localidad: string; provincia: string; codigoPostal: string;
  sucursal: string;
}

const DESTINO_VACIO: DestinoState = {
  tipo: "domicilio", direccion: "", numeroDireccion: "", piso: "", localidad: "", provincia: "", codigoPostal: "", sucursal: "",
};

// Toggle domicilio/sucursal + los campos correspondientes — se reusa tanto
// para generar un Cambio nuevo como para corregir el destino de un pedido
// real de Tienda Nube o editar el destino de un Cambio ya generado.
function DestinoToggleFields({ value, onChange }: { value: DestinoState; onChange: (v: DestinoState) => void }) {
  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {(["domicilio", "sucursal"] as const).map(t => (
          <button
            key={t} type="button" onClick={() => onChange({ ...value, tipo: t })}
            style={{
              flex: 1, padding: "0.4rem", borderRadius: "var(--radius)", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem",
              border: `1px solid ${value.tipo === t ? "var(--primary-color)" : "var(--border-color)"}`,
              background: value.tipo === t ? "var(--primary-color)" : "transparent",
              color: value.tipo === t ? "#fff" : "var(--text-muted)",
            }}
          >
            {t === "sucursal" ? "A sucursal" : "A domicilio"}
          </button>
        ))}
      </div>

      {value.tipo === "sucursal" ? (
        <label className="sf-label">
          Sucursal
          <input
            className="sf-input" value={value.sucursal} onChange={e => onChange({ ...value, sucursal: e.target.value })}
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
              <input className="sf-input" value={value.direccion} onChange={e => onChange({ ...value, direccion: e.target.value })} />
            </label>
            <label className="sf-label">
              Número
              <input className="sf-input" value={value.numeroDireccion} onChange={e => onChange({ ...value, numeroDireccion: e.target.value })} />
            </label>
          </div>
          <div className="ticket-field-grid">
            <label className="sf-label">
              Piso (opcional)
              <input className="sf-input" value={value.piso} onChange={e => onChange({ ...value, piso: e.target.value })} />
            </label>
            <label className="sf-label">
              Localidad
              <input className="sf-input" value={value.localidad} onChange={e => onChange({ ...value, localidad: e.target.value })} />
            </label>
            <label className="sf-label">
              CP
              <input className="sf-input" value={value.codigoPostal} onChange={e => onChange({ ...value, codigoPostal: e.target.value })} />
            </label>
          </div>
          <label className="sf-label">
            Provincia
            <input className="sf-input" value={value.provincia} onChange={e => onChange({ ...value, provincia: e.target.value })} />
          </label>
        </>
      )}
    </>
  );
}

function destinoValido(d: DestinoState): string | null {
  if (d.tipo === "sucursal" && !d.sucursal.trim()) return "Falta la sucursal";
  if (d.tipo === "domicilio" && (!d.direccion.trim() || !d.numeroDireccion.trim())) return "Falta calle y número";
  return null;
}

function labelDestino(d: { tipo: string; sucursal: string; direccion: string; numero_direccion: string; localidad: string }) {
  return d.tipo === "sucursal" ? d.sucursal : `${d.direccion} ${d.numero_direccion}, ${d.localidad}`;
}

// Acciones que generan un Cambio real (envío nuevo) además de registrarse en
// el historial — "producto_faltante" usa exactamente el mismo formulario que
// "generar_envio" (destino + SKU del producto que falta).
const REQUIERE_ENVIO = ["generar_envio", "producto_faltante"];

export default function TicketResolverSection({
  ticketId, acciones, onRegistrada, puedeSupervisar, ticketCliente, ticketNumeroPedido, ticketCanalPedido, cambiosGenerados, envioOverride,
  comprobantes, subiendoComprobante, onSubirComprobante, onBorrarComprobante,
}: {
  ticketId: number;
  acciones: TicketAccionUI[];
  onRegistrada: () => void;
  puedeSupervisar: boolean;
  ticketCliente: TicketCliente;
  ticketNumeroPedido: string | null;
  ticketCanalPedido: string | null;
  cambiosGenerados: CambioGeneradoUI[];
  envioOverride: EnvioOverrideUI | null;
  comprobantes: ComprobanteUI[];
  subiendoComprobante: boolean;
  onSubirComprobante: (file: File, cambioId: number) => void;
  onBorrarComprobante: (adjuntoId: number) => void;
}) {
  const comprobanteInputRef = useRef<HTMLInputElement>(null);
  const [subiendoParaCambioId, setSubiendoParaCambioId] = useState<number | null>(null);

  function abrirSelectorComprobante(cambioId: number) {
    setSubiendoParaCambioId(cambioId);
    comprobanteInputRef.current?.click();
  }

  function onComprobanteSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || subiendoParaCambioId == null) return;
    onSubirComprobante(file, subiendoParaCambioId);
  }
  const esTiendaNube = ticketCanalPedido === "tiendanube";

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
  const [envioNombre, setEnvioNombre] = useState("");
  const [envioTelefono, setEnvioTelefono] = useState("");
  const [envioEmail, setEnvioEmail] = useState("");
  const [envioDni, setEnvioDni] = useState("");
  const [envioSku, setEnvioSku] = useState("");
  const [destino, setDestino] = useState<DestinoState>(DESTINO_VACIO);

  const [editingCambio, setEditingCambio] = useState<CambioGeneradoUI | null>(null);
  const [destinoCambio, setDestinoCambio] = useState<DestinoState>(DESTINO_VACIO);
  const [skuCambio, setSkuCambio] = useState("");
  const [savingCambio, setSavingCambio] = useState(false);
  const [deletingCambioId, setDeletingCambioId] = useState<number | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);

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
    setEnvioNombre(ticketCliente.nombre || "");
    setEnvioTelefono(ticketCliente.telefono || "");
    setEnvioEmail(ticketCliente.email || "");
    setEnvioDni(ticketCliente.dni || "");
    setEnvioSku("");

    if (tipo === "cambiar_direccion" && envioOverride?.tipo) {
      setDestino({
        tipo: (envioOverride.tipo as "domicilio" | "sucursal") ?? "domicilio",
        direccion: envioOverride.direccion ?? "", numeroDireccion: envioOverride.numeroDireccion ?? "",
        piso: envioOverride.piso ?? "", localidad: envioOverride.localidad ?? "", provincia: envioOverride.provincia ?? "",
        codigoPostal: envioOverride.codigoPostal ?? "", sucursal: envioOverride.sucursal ?? "",
      });
    } else {
      setDestino({ ...DESTINO_VACIO, direccion: ticketCliente.direccion || "" });
    }
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
      const err = destinoValido(destino);
      if (err) { alert(err); return; }
    }
    if (!editingAccionId && formTipo === "cambiar_direccion" && esTiendaNube) {
      const err = destinoValido(destino);
      if (err) { alert(err); return; }
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
        const generaCambio = REQUIERE_ENVIO.includes(formTipo) && generarEnvio;
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
            ...(generaCambio ? {
              generarEnvio: true,
              envioTipo: destino.tipo,
              envioNombre: envioNombre.trim(),
              envioTelefono: envioTelefono.trim(),
              envioEmail: envioEmail.trim() || undefined,
              envioDni: envioDni.trim() || undefined,
              envioDireccion: destino.direccion, envioNumeroDireccion: destino.numeroDireccion, envioPiso: destino.piso,
              envioLocalidad: destino.localidad, envioProvincia: destino.provincia, envioCodigoPostal: destino.codigoPostal,
              envioSucursal: destino.sucursal,
              envioSku: envioSku.trim() || undefined,
              numeroPedidoOriginal: ticketNumeroPedido ?? undefined,
            } : {}),
          }),
        });
        if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.error ?? "No se pudo registrar"); return; }

        if (formTipo === "cambiar_direccion" && esTiendaNube) {
          const ovRes = await fetch(`/api/tickets/${ticketId}/envio-override`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: destino.tipo, direccion: destino.direccion, numeroDireccion: destino.numeroDireccion, piso: destino.piso,
              localidad: destino.localidad, provincia: destino.provincia, codigoPostal: destino.codigoPostal, sucursal: destino.sucursal,
            }),
          });
          if (!ovRes.ok) { const d = await ovRes.json().catch(() => null); alert(d?.error ?? "La acción se registró, pero no se pudo guardar la corrección de destino"); }
        }
        cerrarForm();
        onRegistrada();
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

  function abrirEdicionCambio(c: CambioGeneradoUI) {
    setEditingCambio(c);
    setDestinoCambio({
      tipo: (c.tipo as "domicilio" | "sucursal") ?? "domicilio",
      direccion: c.direccion, numeroDireccion: c.numero_direccion, piso: c.piso, localidad: c.localidad,
      provincia: c.provincia, codigoPostal: c.codigo_postal, sucursal: c.sucursal,
    });
    setSkuCambio(c.sku ?? "");
  }

  async function guardarCambio() {
    if (!editingCambio) return;
    const err = destinoValido(destinoCambio);
    if (err) { alert(err); return; }
    setSavingCambio(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/cambios`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cambioId: editingCambio.id, tipo: destinoCambio.tipo,
          direccion: destinoCambio.direccion, numeroDireccion: destinoCambio.numeroDireccion, piso: destinoCambio.piso,
          localidad: destinoCambio.localidad, provincia: destinoCambio.provincia, codigoPostal: destinoCambio.codigoPostal,
          sucursal: destinoCambio.sucursal,
          sku: skuCambio.trim() || null,
        }),
      });
      if (res.ok) { setEditingCambio(null); onRegistrada(); }
      else { const d = await res.json().catch(() => null); alert(d?.error ?? "No se pudo guardar"); }
    } finally {
      setSavingCambio(false);
    }
  }

  async function eliminarCambio(cambioId: number) {
    if (!confirm("¿Eliminar este envío generado? Ya no va a figurar en Cambios para procesar.")) return;
    setDeletingCambioId(cambioId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/cambios`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cambioId }),
      });
      if (res.ok) onRegistrada();
      else { const d = await res.json().catch(() => null); alert(d?.error ?? "No se pudo eliminar"); }
    } finally {
      setDeletingCambioId(null);
    }
  }

  async function quitarOverride() {
    if (!confirm("¿Quitar la corrección de destino? El pedido vuelve a usar lo que vino de Tienda Nube.")) return;
    setSavingOverride(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/envio-override`, { method: "DELETE" });
      if (res.ok) onRegistrada();
    } finally {
      setSavingOverride(false);
    }
  }

  const mostrarCheckboxCosto = !editingAccionId && formTipo && COSTO_SUGERIDO[formTipo] && monto.trim();
  const mostrarEnvioCambio = !editingAccionId && !!formTipo && REQUIERE_ENVIO.includes(formTipo);
  const overrideActivo = !!envioOverride && (envioOverride.tipo != null);

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

      {esTiendaNube && overrideActivo && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
            Destino corregido del pedido
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem",
            border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.08)", borderRadius: "var(--radius)", padding: "0.45rem 0.7rem", fontSize: "0.8rem",
          }}>
            <span>
              <i className={envioOverride!.tipo === "sucursal" ? "fas fa-store" : "fas fa-house"} style={{ marginRight: "0.4rem", color: "var(--primary-color)" }} />
              {envioOverride!.tipo === "sucursal" ? envioOverride!.sucursal : `${envioOverride!.direccion} ${envioOverride!.numeroDireccion}, ${envioOverride!.localidad}`}
              <span style={{ color: "var(--text-muted)" }}> · se aplica al procesar este pedido</span>
            </span>
            <span style={{ display: "flex", gap: "0.4rem" }}>
              <button className="sf-icon-btn" title="Editar destino" onClick={() => abrirForm("cambiar_direccion")} style={{ width: 24, height: 24, fontSize: "0.68rem" }}>
                <i className="fas fa-pen" />
              </button>
              <button className="sf-icon-btn" title="Quitar corrección" onClick={quitarOverride} disabled={savingOverride} style={{ width: 24, height: 24, fontSize: "0.68rem", color: "var(--danger-color, #ef4444)" }}>
                {savingOverride ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-times" />}
              </button>
            </span>
          </div>
        </div>
      )}

      {cambiosGenerados.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
            Envíos generados para Andreani
          </div>
          <input ref={comprobanteInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={onComprobanteSeleccionado} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {cambiosGenerados.map(c => {
              const comprobantesDelCambio = comprobantes.filter(a => a.cambio_id === c.id);
              const subiendoEste = subiendoComprobante && subiendoParaCambioId === c.id;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex", flexDirection: "column", gap: "0.4rem",
                    border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.45rem 0.7rem", fontSize: "0.8rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                    <a href="/cambios" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-color)", textDecoration: "none", flex: 1, minWidth: 0 }}>
                      <i className={c.tipo === "sucursal" ? "fas fa-store" : "fas fa-house"} style={{ marginRight: "0.4rem", color: "var(--primary-color)" }} />
                      {labelDestino(c)}
                      {c.sku && <span style={{ color: "var(--text-muted)" }}> · SKU: {c.sku}</span>}
                      {c.tracking && <span style={{ color: "var(--text-muted)" }}> · Tracking: {c.tracking}</span>}
                    </a>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                      <span className={`sf-badge ${c.procesado ? "" : "sf-badge-warning"}`}>{c.procesado ? "Procesado" : "Pendiente"}</span>
                      {!c.procesado && (
                        <>
                          <button className="sf-icon-btn" title="Editar destino" onClick={() => abrirEdicionCambio(c)} style={{ width: 24, height: 24, fontSize: "0.68rem" }}>
                            <i className="fas fa-pen" />
                          </button>
                          {puedeSupervisar && (
                            <button
                              className="sf-icon-btn" title="Eliminar envío" onClick={() => eliminarCambio(c.id)}
                              disabled={deletingCambioId === c.id} style={{ width: 24, height: 24, fontSize: "0.68rem", color: "var(--danger-color, #ef4444)" }}
                            >
                              {deletingCambioId === c.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
                            </button>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    {comprobantesDelCambio.map(a => (
                      <div key={a.id} style={{ position: "relative" }}>
                        {a.resource_type === "image" ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer">
                            <img src={a.url} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
                          </a>
                        ) : (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.nombre_archivo ?? ""} style={{
                            width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                            border: "1px solid var(--border-color)", borderRadius: "var(--radius)", fontSize: "1rem", color: "var(--text-muted)",
                          }}>
                            <i className="fas fa-file-pdf" />
                          </a>
                        )}
                        {puedeSupervisar && (
                          <button type="button" onClick={() => onBorrarComprobante(a.id)} title="Eliminar" style={{
                            position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%",
                            background: "var(--error-color)", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.55rem", lineHeight: 1,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <i className="fas fa-times" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      className="sf-btn sf-btn-secondary" onClick={() => abrirSelectorComprobante(c.id)} disabled={subiendoComprobante}
                      style={{ fontSize: "0.7rem", padding: "0.3rem 0.55rem" }}
                    >
                      {subiendoEste ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-paperclip" /> Adjuntar comprobante</>}
                    </button>
                  </div>
                </div>
              );
            })}
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

              {mostrarEnvioCambio && (
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
                      <label className="sf-label">
                        SKU del producto (opcional)
                        <input className="sf-input" value={envioSku} onChange={e => setEnvioSku(e.target.value)} placeholder="Ej: CTRL-01" />
                      </label>
                      <DestinoToggleFields value={destino} onChange={setDestino} />
                    </>
                  )}
                </div>
              )}

              {formTipo === "cambiar_direccion" && !editingAccionId && (
                esTiendaNube ? (
                  <div style={{ border: "1px dashed var(--border-color)", borderRadius: "var(--radius)", padding: "0.6rem 0.7rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
                      <i className="fas fa-circle-info" style={{ marginRight: "0.3rem" }} />
                      Este destino se guarda como corrección del pedido de Tienda Nube — ya va a figurar así en Pedidos/Procesar.
                    </p>
                    <DestinoToggleFields value={destino} onChange={setDestino} />
                  </div>
                ) : (
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    <i className="fas fa-circle-info" style={{ marginRight: "0.3rem" }} />
                    Este pedido no es de Tienda Nube, así que no se puede corregir el destino automáticamente — registrá el detalle arriba.
                  </p>
                )
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

      {editingCambio && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !savingCambio && setEditingCambio(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(420px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-map-pin" style={{ color: "var(--primary-color)" }} />
                Editar destino del envío
              </h3>
              <button className="sf-close-btn" onClick={() => setEditingCambio(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label className="sf-label">
                SKU del producto (opcional)
                <input className="sf-input" value={skuCambio} onChange={e => setSkuCambio(e.target.value)} placeholder="Ej: CTRL-01" />
              </label>
              <DestinoToggleFields value={destinoCambio} onChange={setDestinoCambio} />
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setEditingCambio(null)} disabled={savingCambio}>Cancelar</button>
              <button className="sf-btn" onClick={guardarCambio} disabled={savingCambio}>
                {savingCambio ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-check" /> Guardar cambios</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
