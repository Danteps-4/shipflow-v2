"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import TicketResolverSection, { TicketAccionUI, CambioGeneradoUI, EnvioOverrideUI } from "@/components/TicketResolverSection";
import { TicketHistorialEntryUI } from "@/components/TicketHistorial";
import { TicketResumenClienteUI } from "@/components/TicketClienteHistorial";
import TicketCustomerPanel from "@/components/TicketCustomerPanel";
import { labelCategoria, labelSubcategoria1, labelSubcategoria2, FORMAS_PAGO } from "@/lib/ticketCategorias";

// ─── Tipos ────────────────────────────────────────────────────────────────────

const ESTADOS_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  pendiente_supervision: "Pendiente supervisión",
  en_gestion: "En gestión",
  esperando_cliente: "Esperando cliente",
  esperando_pago: "Esperando pago",
  esperando_devolucion: "Esperando devolución",
  esperando_logistica: "Esperando logística",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};
const ESTADOS = Object.keys(ESTADOS_LABELS);
const ESTADO_COLORS: Record<string, string> = {
  nuevo: "#3b82f6",
  pendiente_supervision: "#f59e0b",
  en_gestion: "#8b5cf6",
  esperando_cliente: "#eab308",
  esperando_pago: "#eab308",
  esperando_devolucion: "#f97316",
  esperando_logistica: "#06b6d4",
  resuelto: "#22c55e",
  cerrado: "#64748b",
  cancelado: "#ef4444",
};
// Mismo color que en app/tickets/page.tsx (duplicado a propósito, igual que
// ESTADO_COLORS — no hay constantes compartidas para Tickets todavía).
const CATEGORIA_FACTURA_COLOR = "#d946ef";
const PRIORIDADES = ["normal", "alta", "urgente"];
const PRIORIDAD_LABELS: Record<string, string> = { normal: "Normal", alta: "Alta", urgente: "Urgente" };
const CANALES_CONTACTO = ["WhatsApp", "Instagram", "Email", "Trusty", "Otro"];
const TIPOS_COSTO_LABELS: Record<string, string> = {
  producto_enviado: "Producto enviado", envio: "Envío", devolucion: "Devolución", reembolso: "Reembolso", otro: "Otro",
};

interface ProductoPedido { sku: string | null; nombre: string; cantidad: number; precio: number | null; }

interface TicketCosto { id: number; tipo: string; descripcion: string | null; monto: string; sku: string | null; created_by: string; created_at: string; }
interface TicketAdjunto { id: number; url: string; resource_type: string; nombre_archivo: string | null; created_by: string; created_at: string; cambio_id: number | null; }
interface TicketComentario { id: number; texto: string; created_by: string; created_at: string; }

interface TicketDetalle {
  id: number;
  canal_pedido: string | null;
  numero_pedido: string | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_instagram: string | null;
  cliente_dni: string | null;
  cliente_direccion: string | null;
  pedido_total: string | null;
  pedido_moneda: string | null;
  pedido_fecha: string | null;
  pedido_estado: string | null;
  pedido_transportista: string | null;
  pedido_tracking: string | null;
  pedido_productos_json: ProductoPedido[] | null;
  categoria: string;
  subcategoria_1: string | null;
  subcategoria_2: string | null;
  canal_contacto: string | null;
  descripcion: string | null;
  troubleshooting: string | null;
  marca: string | null;
  factura_datos: string | null;
  factura_forma_pago: string | null;
  estado: string;
  prioridad: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  valor_comercial: string | null;
  sla_vencimiento: string | null;
  created_by: string;
  created_at: string;
  acciones: TicketAccionUI[];
  costos: TicketCosto[];
  costoTotal: number;
  adjuntos: TicketAdjunto[];
  comentarios: TicketComentario[];
  historial: TicketHistorialEntryUI[];
}

interface Me { id: string; name: string; role: "admin" | "member"; ticketsPuedeSupervisar?: boolean; }

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TicketDetallePage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [detalle, setDetalle] = useState<TicketDetalle | null>(null);
  const [otrosTickets, setOtrosTickets] = useState<TicketResumenClienteUI[]>([]);
  const [accionesResumen, setAccionesResumen] = useState<Record<string, number>>({});
  const [cambiosGenerados, setCambiosGenerados] = useState<CambioGeneradoUI[]>([]);
  const [envioOverride, setEnvioOverride] = useState<EnvioOverrideUI | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [savingCampo, setSavingCampo] = useState(false);

  const [comentario, setComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  const [costoForm, setCostoForm] = useState({ tipo: "producto_enviado", descripcion: "", monto: "", sku: "" });
  const [guardandoCosto, setGuardandoCosto] = useState(false);

  const [editandoValorComercial, setEditandoValorComercial] = useState(false);
  const [valorComercialDraft, setValorComercialDraft] = useState("");

  const [editingTelefono, setEditingTelefono] = useState(false);
  const [telefonoDraft, setTelefonoDraft] = useState("");
  const [editingInstagram, setEditingInstagram] = useState(false);
  const [instagramDraft, setInstagramDraft] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [editingDireccion, setEditingDireccion] = useState(false);
  const [direccionDraft, setDireccionDraft] = useState("");

  const [mostrarFormCosto, setMostrarFormCosto] = useState(false);

  const [editandoFactura, setEditandoFactura] = useState(false);
  const [facturaDraft, setFacturaDraft] = useState({ datos: "", formaPago: "" });

  const [subiendo, setSubiendo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const puedeSupervisar = me?.role === "admin" || !!me?.ticketsPuedeSupervisar;

  useEffect(() => {
    fetch("/api/user/me").then(r => r.json()).then(d => setMe(d.user ?? null)).catch(() => {});
  }, []);

  // `silent` evita el spinner de página completa en los refetch que se
  // disparan después de una edición (comentario, costo, acción, etc): esos
  // solo deben actualizar los datos en el lugar, no tapar todo con el
  // loader como si fuera la primera carga.
  const fetchDetalle = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/tickets/${id}`);
      if (r.status === 404) { setNotFound(true); return; }
      if (r.ok) {
        const d = await r.json();
        setDetalle(d.ticket);
        setOtrosTickets(d.otrosTickets ?? []);
        setAccionesResumen(d.accionesResumen ?? {});
        setCambiosGenerados(d.cambiosGenerados ?? []);
        setEnvioOverride(d.envioOverride ?? null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetalle(); }, [fetchDetalle]);

  async function patchTicket(body: Record<string, unknown>) {
    setSavingCampo(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchDetalle(true);
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? "No se pudo guardar");
      }
    } finally {
      setSavingCampo(false);
    }
  }

  async function enviarComentario() {
    if (!comentario.trim()) return;
    setEnviandoComentario(true);
    try {
      const res = await fetch(`/api/tickets/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: comentario.trim() }),
      });
      if (res.ok) { setComentario(""); await fetchDetalle(true); }
    } finally {
      setEnviandoComentario(false);
    }
  }

  async function agregarCosto() {
    const monto = Number(costoForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) { alert("Ingresá un monto válido"); return; }
    setGuardandoCosto(true);
    try {
      const res = await fetch(`/api/tickets/${id}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: costoForm.tipo, descripcion: costoForm.descripcion || null, monto, sku: costoForm.sku || null }),
      });
      if (res.ok) {
        setCostoForm({ tipo: "producto_enviado", descripcion: "", monto: "", sku: "" });
        setMostrarFormCosto(false);
        await fetchDetalle(true);
      }
    } finally {
      setGuardandoCosto(false);
    }
  }

  async function borrarCosto(costoId: number) {
    if (!confirm("¿Eliminar este costo?")) return;
    const res = await fetch(`/api/tickets/${id}/costs`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costoId }),
    });
    if (res.ok) await fetchDetalle(true);
    else alert((await res.json().catch(() => null))?.error ?? "No se pudo eliminar");
  }

  function abrirEditarFactura() {
    if (!detalle) return;
    setFacturaDraft({
      datos: detalle.factura_datos ?? "", formaPago: detalle.factura_forma_pago ?? "",
    });
    setEditandoFactura(true);
  }

  async function guardarFactura() {
    await patchTicket({
      facturaDatos: facturaDraft.datos.trim() || null,
      facturaFormaPago: facturaDraft.formaPago || null,
    });
    setEditandoFactura(false);
  }

  async function subirArchivo(file: File, cambioId?: number) {
    setSubiendo(true);
    try {
      const firmaRes = await fetch("/api/tickets/upload-signature", { method: "POST" });
      if (!firmaRes.ok) throw new Error();
      const { timestamp, signature, apiKey, cloudName } = await firmaRes.json();
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", apiKey);
      body.append("timestamp", String(timestamp));
      body.append("signature", signature);
      body.append("folder", "shipflow-tickets");
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: "POST", body });
      if (!uploadRes.ok) throw new Error();
      const data = await uploadRes.json();
      const resourceType = data.resource_type === "video" ? "video" : data.resource_type === "raw" ? "raw" : "image";
      const res = await fetch(`/api/tickets/${id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.secure_url, publicId: data.public_id, resourceType, nombreArchivo: file.name, cambioId }),
      });
      if (!res.ok) throw new Error();
      await fetchDetalle(true);
      return true;
    } catch {
      alert("No se pudo subir el archivo. Probá de nuevo.");
      return false;
    } finally {
      setSubiendo(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(f => subirArchivo(f));
  }

  async function borrarTicket() {
    if (!confirm("¿Eliminar este ticket por completo? No se puede deshacer. Para un caso terminado, mejor pasalo a Cancelado en vez de borrarlo.")) return;
    const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/tickets");
    else alert((await res.json().catch(() => null))?.error ?? "No se pudo eliminar");
  }

  async function borrarAdjunto(adjuntoId: number) {
    if (!confirm("¿Eliminar este adjunto?")) return;
    const res = await fetch(`/api/tickets/${id}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjuntoId }),
    });
    if (res.ok) await fetchDetalle(true);
    else alert((await res.json().catch(() => null))?.error ?? "No se pudo eliminar");
  }

  if (notFound) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <main className="sf-main"><div className="sf-container">
          <div className="sf-empty"><i className="fas fa-ticket sf-empty-icon" /><p style={{ fontWeight: 600 }}>Ticket no encontrado</p></div>
        </div></main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}><i className="fas fa-bars" /></button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
      </header>

      <main className="sf-main">
        <div className="sf-container">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <button className="sf-btn sf-btn-secondary" onClick={() => router.push("/tickets")}>
              <i className="fas fa-arrow-left" /> Volver a Tickets
            </button>
            {puedeSupervisar && detalle && (
              <button className="sf-icon-btn danger" title="Eliminar ticket" onClick={borrarTicket}>
                <i className="fas fa-trash" />
              </button>
            )}
          </div>

          {loading || !detalle ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
            </div>
          ) : (
            <div className="ticket-detail-grid">
              {/* ── Columna principal ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Header */}
                <div className="ticket-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                    <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Ticket #{detalle.id}</h1>
                    <span
                      className="sf-badge"
                      style={{ background: ESTADO_COLORS[detalle.estado] + "22", color: ESTADO_COLORS[detalle.estado], border: `1px solid ${ESTADO_COLORS[detalle.estado]}44` }}
                    >
                      {ESTADOS_LABELS[detalle.estado]}
                    </span>
                    <span
                      className="sf-badge"
                      style={detalle.categoria === "hacer_factura"
                        ? { fontWeight: 700, background: CATEGORIA_FACTURA_COLOR + "22", color: CATEGORIA_FACTURA_COLOR, border: `1px solid ${CATEGORIA_FACTURA_COLOR}44` }
                        : undefined}
                    >
                      {detalle.categoria === "hacer_factura" && <i className="fas fa-file-invoice" style={{ marginRight: "0.3rem" }} />}
                      {labelCategoria(detalle.categoria)}
                    </span>
                    {detalle.subcategoria_1 && <span className="sf-badge">{labelSubcategoria1(detalle.categoria, detalle.subcategoria_1)}</span>}
                    {detalle.subcategoria_2 && <span className="sf-badge">{labelSubcategoria2(detalle.categoria, detalle.subcategoria_1 ?? "", detalle.subcategoria_2)}</span>}
                  </div>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Creado por {detalle.created_by || "—"} · {fmtDateTime(detalle.created_at)}
                  </p>

                  <div className="ticket-field-grid" style={{ marginTop: "0.85rem" }}>
                    <label className="sf-label">
                      Estado
                      <select className="sf-input" value={detalle.estado} disabled={savingCampo} onChange={e => patchTicket({ estado: e.target.value })}>
                        {ESTADOS.map(e => <option key={e} value={e}>{ESTADOS_LABELS[e]}</option>)}
                      </select>
                    </label>
                    <label className="sf-label">
                      Prioridad
                      <select className="sf-input" value={detalle.prioridad} disabled={savingCampo} onChange={e => patchTicket({ prioridad: e.target.value })}>
                        {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>)}
                      </select>
                    </label>
                    <label className="sf-label">
                      Canal de contacto
                      <select className="sf-input" value={detalle.canal_contacto ?? ""} disabled={savingCampo} onChange={e => patchTicket({ canalContacto: e.target.value || null })}>
                        <option value="">Sin especificar</option>
                        {CANALES_CONTACTO.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.85rem" }}>
                      <i className="fas fa-user" style={{ marginRight: "0.35rem", color: "var(--text-muted)" }} />
                      Responsable: <strong>{detalle.responsable_nombre || "Sin asignar"}</strong>
                    </span>
                    {me && detalle.responsable_id !== me.id && (
                      <button className="sf-btn sf-btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }} disabled={savingCampo}
                        onClick={() => patchTicket({ responsableId: me.id, responsableNombre: me.name })}>
                        Asignarme
                      </button>
                    )}
                    {detalle.responsable_id && (
                      <button className="sf-btn sf-btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }} disabled={savingCampo}
                        onClick={() => patchTicket({ responsableId: null, responsableNombre: null })}>
                        Quitar asignación
                      </button>
                    )}
                  </div>
                </div>

                {/* Pedido original (o carga manual, si no hay pedido vinculado) */}
                {!detalle.numero_pedido ? (
                  <div className="ticket-card">
                    <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
                      <div className="sf-step-badge"><i className="fas fa-receipt" style={{ fontSize: "0.65rem" }} /></div>
                      <div>
                        <h2>Pedido</h2>
                        <p>Sin pedido vinculado — carga manual</p>
                      </div>
                    </div>
                  </div>
                ) : (
                <div className="ticket-card">
                  <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
                    <div className="sf-step-badge"><i className="fas fa-receipt" style={{ fontSize: "0.65rem" }} /></div>
                    <div>
                      <h2>Pedido original</h2>
                      <p>{detalle.canal_pedido === "tiendanube" ? "Tienda Nube" : "Mercado Libre"} · #{detalle.numero_pedido}</p>
                    </div>
                  </div>

                  <div className="sf-info-block">
                    <div className="sf-info-block-grid">
                      <div><strong>Cliente:</strong> {detalle.cliente_nombre || "—"}</div>
                      <div><strong>DNI:</strong> {detalle.cliente_dni || "—"}</div>
                      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        {editingDireccion ? (
                          <>
                            <strong>Dirección:</strong>
                            <input className="sf-input" style={{ maxWidth: 320, flex: 1 }} value={direccionDraft} onChange={e => setDireccionDraft(e.target.value)} autoFocus
                              onKeyDown={e => { if (e.key === "Enter") patchTicket({ clienteDireccion: direccionDraft.trim() || null }).then(() => setEditingDireccion(false)); if (e.key === "Escape") setEditingDireccion(false); }} />
                            <button className="sf-icon-btn" onClick={() => patchTicket({ clienteDireccion: direccionDraft.trim() || null }).then(() => setEditingDireccion(false))} disabled={savingCampo}><i className="fas fa-check" /></button>
                            <button className="sf-icon-btn" onClick={() => setEditingDireccion(false)}><i className="fas fa-times" /></button>
                          </>
                        ) : (
                          <>
                            <strong>Dirección:</strong> {detalle.cliente_direccion || "—"}
                            <button className="sf-icon-btn" title="Editar dirección" onClick={() => { setDireccionDraft(detalle.cliente_direccion || ""); setEditingDireccion(true); }} style={{ width: 24, height: 24, fontSize: "0.68rem" }}>
                              <i className="fas fa-pen" />
                            </button>
                          </>
                        )}
                      </div>
                      <div><strong>Total:</strong> {detalle.pedido_total ? `${detalle.pedido_moneda ?? ""} ${Number(detalle.pedido_total).toLocaleString("es-AR")}` : "—"}</div>
                      <div><strong>Fecha:</strong> {detalle.pedido_fecha ? fmtDateTime(detalle.pedido_fecha) : "—"}</div>
                      <div><strong>Transportista:</strong> {detalle.pedido_transportista || "—"}</div>
                      <div><strong>Tracking:</strong> {detalle.pedido_tracking || "—"}</div>
                      <div style={{ gridColumn: "1 / -1" }}><strong>Estado del pedido:</strong> {detalle.pedido_estado || "—"}</div>
                      {!!detalle.pedido_productos_json?.length && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <strong>Productos:</strong> {detalle.pedido_productos_json.map(p => `${p.nombre}${p.cantidad > 1 ? ` x${p.cantidad}` : ""}`).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <a
                    href={detalle.canal_pedido === "tiendanube" ? "/orders" : "/mercadolibre/pedidos"}
                    style={{ fontSize: "0.8rem", color: "var(--primary-color)", display: "inline-flex", alignItems: "center", gap: "0.35rem", marginTop: "0.5rem" }}
                  >
                    Ver pedidos <i className="fas fa-arrow-up-right-from-square" style={{ fontSize: "0.7rem" }} />
                  </a>
                </div>
                )}

                {/* Datos de facturación (solo categoría "Hacer factura") */}
                {detalle.categoria === "hacer_factura" && (
                  <div className="ticket-card">
                    <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
                      <div className="sf-step-badge"><i className="fas fa-file-invoice" style={{ fontSize: "0.65rem" }} /></div>
                      <div><h2>Datos de facturación</h2></div>
                    </div>
                    {editandoFactura ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        <label className="sf-label">Datos para facturar
                          <textarea className="sf-input" rows={4} value={facturaDraft.datos} onChange={e => setFacturaDraft(f => ({ ...f, datos: e.target.value }))} style={{ resize: "vertical", fontFamily: "inherit" }} />
                        </label>
                        <label className="sf-label">Forma de pago
                          <select className="sf-input" value={facturaDraft.formaPago} onChange={e => setFacturaDraft(f => ({ ...f, formaPago: e.target.value }))}>
                            <option value="">Seleccionar...</option>
                            {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </label>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button className="sf-btn sf-btn-secondary" onClick={() => setEditandoFactura(false)} disabled={savingCampo}>Cancelar</button>
                          <button className="sf-btn" onClick={guardarFactura} disabled={savingCampo}>Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="sf-info-block">
                        <div style={{ whiteSpace: "pre-wrap" }}>{detalle.factura_datos || "Sin datos cargados"}</div>
                        <div style={{ marginTop: "0.5rem" }}><strong>Forma de pago:</strong> {detalle.factura_forma_pago || "—"}</div>
                        <button className="sf-btn sf-btn-secondary" style={{ marginTop: "0.6rem", padding: "0.3rem 0.6rem", fontSize: "0.8rem" }} onClick={abrirEditarFactura}>
                          <i className="fas fa-pen" /> Editar
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Factura (solo categoría "Hacer factura") — reemplaza Descripción/
                    Resolver ticket/Costos, que no aplican a este tipo de ticket */}
                {detalle.categoria === "hacer_factura" && (
                  <div className="ticket-card">
                    <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
                      <div className="sf-step-badge" style={{ background: CATEGORIA_FACTURA_COLOR }}><i className="fas fa-file-invoice-dollar" style={{ fontSize: "0.65rem" }} /></div>
                      <div><h2>Factura</h2><p>Subí acá la factura ya generada</p></div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      {detalle.adjuntos.map(a => (
                        <div key={a.id} style={{ position: "relative" }}>
                          {a.resource_type === "image" ? (
                            <button type="button" onClick={() => setPreviewImage(a.url)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                              <img src={a.url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
                            </button>
                          ) : (
                            <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.nombre_archivo ?? ""} style={{
                              width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center",
                              border: "1px solid var(--border-color)", borderRadius: "var(--radius)", fontSize: "1.4rem", color: "var(--text-muted)",
                            }}>
                              <i className={a.resource_type === "video" ? "fas fa-film" : "fas fa-file"} />
                            </a>
                          )}
                          {puedeSupervisar && (
                            <button type="button" onClick={() => borrarAdjunto(a.id)} title="Eliminar" style={{
                              position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                              background: "var(--error-color)", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.65rem", lineHeight: 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <i className="fas fa-times" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div
                      className="sf-dropzone" style={{ maxWidth: 260 }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
                      {subiendo ? (
                        <><i className="fas fa-spinner fa-spin" /><span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Subiendo…</span></>
                      ) : (
                        <><i className="fas fa-cloud-arrow-up" /><span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Cargar factura</span></>
                      )}
                    </div>
                  </div>
                )}

                {detalle.categoria !== "hacer_factura" && (
                  <>
                {/* Descripción + adjuntos */}
                <div className="ticket-card">
                  <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
                    <div className="sf-step-badge"><i className="fas fa-file-lines" style={{ fontSize: "0.65rem" }} /></div>
                    <div><h2>Descripción</h2></div>
                  </div>
                  {detalle.descripcion && <p style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap", marginBottom: "0.75rem" }}>{detalle.descripcion}</p>}
                  {detalle.troubleshooting && (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                      <strong>Troubleshooting ya realizado:</strong> {detalle.troubleshooting}
                    </p>
                  )}

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    {detalle.adjuntos.filter(a => a.cambio_id == null).map(a => (
                      <div key={a.id} style={{ position: "relative" }}>
                        {a.resource_type === "image" ? (
                          <button type="button" onClick={() => setPreviewImage(a.url)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                            <img src={a.url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
                          </button>
                        ) : (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.nombre_archivo ?? ""} style={{
                            width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center",
                            border: "1px solid var(--border-color)", borderRadius: "var(--radius)", fontSize: "1.4rem", color: "var(--text-muted)",
                          }}>
                            <i className={a.resource_type === "video" ? "fas fa-film" : "fas fa-file"} />
                          </a>
                        )}
                        {puedeSupervisar && (
                          <button type="button" onClick={() => borrarAdjunto(a.id)} title="Eliminar" style={{
                            position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                            background: "var(--error-color)", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.65rem", lineHeight: 1,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <i className="fas fa-times" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div
                    className="sf-dropzone" style={{ maxWidth: 260 }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
                    {subiendo ? (
                      <><i className="fas fa-spinner fa-spin" /><span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Subiendo…</span></>
                    ) : (
                      <><i className="fas fa-cloud-arrow-up" /><span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Agregar adjunto</span></>
                    )}
                  </div>
                </div>

                {/* Resolver ticket */}
                <div className="ticket-card">
                  <TicketResolverSection
                    ticketId={detalle.id} acciones={detalle.acciones} onRegistrada={() => fetchDetalle(true)} puedeSupervisar={puedeSupervisar}
                    ticketCliente={{
                      nombre: detalle.cliente_nombre, telefono: detalle.cliente_telefono,
                      email: detalle.cliente_email, dni: detalle.cliente_dni, direccion: detalle.cliente_direccion,
                    }}
                    ticketNumeroPedido={detalle.numero_pedido}
                    ticketCanalPedido={detalle.canal_pedido}
                    cambiosGenerados={cambiosGenerados}
                    envioOverride={envioOverride}
                    comprobantes={detalle.adjuntos.filter(a => a.cambio_id != null)}
                    subiendoComprobante={subiendo}
                    onSubirComprobante={(file, cambioId) => subirArchivo(file, cambioId)}
                    onBorrarComprobante={borrarAdjunto}
                  />
                </div>

                {/* Costos */}
                <div className="ticket-card">
                  <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
                    <div className="sf-step-badge"><i className="fas fa-coins" style={{ fontSize: "0.65rem" }} /></div>
                    <div>
                      <h2>Costos</h2>
                      <p>Valor comercial vs. costo real del ticket</p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Valor comercial</div>
                      {editandoValorComercial ? (
                        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                          <input className="sf-input" type="number" min="0" step="0.01" style={{ width: 120 }} value={valorComercialDraft} onChange={e => setValorComercialDraft(e.target.value)} autoFocus />
                          <button className="sf-icon-btn" onClick={() => { patchTicket({ valorComercial: valorComercialDraft.trim() ? Number(valorComercialDraft) : null }); setEditandoValorComercial(false); }}><i className="fas fa-check" /></button>
                        </div>
                      ) : (
                        <div style={{ fontSize: "1.2rem", fontWeight: 700, cursor: "pointer" }} onClick={() => { setValorComercialDraft(detalle.valor_comercial ?? ""); setEditandoValorComercial(true); }}>
                          {detalle.valor_comercial ? `$${Number(detalle.valor_comercial).toLocaleString("es-AR")}` : "—"} <i className="fas fa-pen" style={{ fontSize: "0.65rem", color: "var(--text-muted)" }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Costo total del ticket</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--error-color)" }}>${detalle.costoTotal.toLocaleString("es-AR")}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
                    <i className="fas fa-circle-info" style={{ marginRight: "0.3rem" }} />
                    Son dos cosas distintas: el <strong>valor comercial</strong> es lo que el producto/pedido vale de lista (un solo número, editable arriba). El <strong>costo total</strong> es la suma de los ítems cargados en la lista de abajo — se registra acá o marcando &quot;sumar como costo&quot; al cargar una acción en Resolver ticket, nunca automáticamente.
                  </p>

                  {detalle.costos.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.85rem" }}>
                      {detalle.costos.map(c => (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>
                          <span>
                            <strong>{TIPOS_COSTO_LABELS[c.tipo] ?? c.tipo}</strong>
                            {c.descripcion && ` — ${c.descripcion}`}
                            {c.sku && <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}> ({c.sku})</span>}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <strong>${Number(c.monto).toLocaleString("es-AR")}</strong>
                            {puedeSupervisar && (
                              <button className="sf-icon-btn" title="Eliminar" onClick={() => borrarCosto(c.id)}><i className="fas fa-trash" /></button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {mostrarFormCosto ? (
                    <div style={{ border: "1px dashed var(--border-color)", borderRadius: "var(--radius)", padding: "0.75rem" }}>
                      <div className="ticket-field-grid" style={{ marginBottom: "0.6rem" }}>
                        <label className="sf-label">
                          Tipo
                          <select className="sf-input" value={costoForm.tipo} onChange={e => setCostoForm(f => ({ ...f, tipo: e.target.value }))}>
                            {Object.entries(TIPOS_COSTO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </label>
                        <label className="sf-label">
                          Monto
                          <input className="sf-input" type="number" min="0" step="0.01" value={costoForm.monto} onChange={e => setCostoForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
                        </label>
                        <label className="sf-label">
                          SKU (opcional)
                          <input className="sf-input" value={costoForm.sku} onChange={e => setCostoForm(f => ({ ...f, sku: e.target.value }))} placeholder="Opcional" />
                        </label>
                      </div>
                      <label className="sf-label" style={{ marginBottom: "0.6rem" }}>
                        Descripción
                        <input className="sf-input" value={costoForm.descripcion} onChange={e => setCostoForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Opcional" />
                      </label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="sf-btn sf-btn-secondary" onClick={() => setMostrarFormCosto(false)} disabled={guardandoCosto}>Cancelar</button>
                        <button className="sf-btn" onClick={agregarCosto} disabled={guardandoCosto || !costoForm.monto.trim()}>
                          {guardandoCosto ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus" /> Agregar costo</>}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="sf-btn sf-btn-secondary" onClick={() => setMostrarFormCosto(true)}>
                      <i className="fas fa-plus" /> Agregar costo
                    </button>
                  )}
                </div>
                  </>
                )}

                {/* Comentarios internos */}
                <div className="ticket-card">
                  <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
                    <div className="sf-step-badge"><i className="fas fa-lock" style={{ fontSize: "0.65rem" }} /></div>
                    <div>
                      <h2>Comentarios internos</h2>
                      <p>Nunca se envían al cliente</p>
                    </div>
                  </div>
                  {detalle.comentarios.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      {detalle.comentarios.map(c => (
                        <div key={c.id} style={{ background: "rgba(15,23,42,0.4)", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.6rem 0.8rem" }}>
                          <p style={{ fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{c.texto}</p>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{c.created_by} · {fmtDateTime(c.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <textarea className="sf-input" rows={2} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Agregar una nota interna..." style={{ resize: "vertical", fontFamily: "inherit", flex: 1 }} />
                    <button className="sf-btn" onClick={enviarComentario} disabled={enviandoComentario || !comentario.trim()}>
                      {enviandoComentario ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                    </button>
                  </div>
                </div>

              </div>

              {/* ── Columna lateral: identidad, contactos e historial ── */}
              <div className="ticket-card">
                <TicketCustomerPanel
                  clienteNombre={detalle.cliente_nombre}
                  saving={savingCampo}
                  telefono={{
                    value: detalle.cliente_telefono, editing: editingTelefono, draft: telefonoDraft, setDraft: setTelefonoDraft,
                    onStart: () => { setTelefonoDraft(detalle.cliente_telefono || ""); setEditingTelefono(true); },
                    onCancel: () => setEditingTelefono(false),
                    onSave: () => patchTicket({ clienteTelefono: telefonoDraft.trim() || null }).then(() => setEditingTelefono(false)),
                  }}
                  instagram={{
                    value: detalle.cliente_instagram, editing: editingInstagram, draft: instagramDraft, setDraft: setInstagramDraft,
                    onStart: () => { setInstagramDraft(detalle.cliente_instagram || ""); setEditingInstagram(true); },
                    onCancel: () => setEditingInstagram(false),
                    onSave: () => patchTicket({ clienteInstagram: instagramDraft.trim() || null }).then(() => setEditingInstagram(false)),
                  }}
                  email={{
                    value: detalle.cliente_email, editing: editingEmail, draft: emailDraft, setDraft: setEmailDraft,
                    onStart: () => { setEmailDraft(detalle.cliente_email || ""); setEditingEmail(true); },
                    onCancel: () => setEditingEmail(false),
                    onSave: () => patchTicket({ clienteEmail: emailDraft.trim() || null }).then(() => setEditingEmail(false)),
                  }}
                  otrosTickets={otrosTickets}
                  accionesResumen={accionesResumen}
                  historial={detalle.historial}
                  creadoEn={detalle.created_at}
                  numeroPedido={detalle.numero_pedido}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>

      {previewImage && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setPreviewImage(null)} />
          <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 3100, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", pointerEvents: "none" }}>
            <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", pointerEvents: "auto" }}>
              <button className="sf-close-btn" onClick={() => setPreviewImage(null)} style={{ position: "absolute", top: "-2.5rem", right: 0, color: "#fff", fontSize: "1.5rem" }}><i className="fas fa-times" /></button>
              <img src={previewImage} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
