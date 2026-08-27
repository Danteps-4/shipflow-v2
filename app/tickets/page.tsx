"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import TicketStatCards from "@/components/TicketStatCards";
import TicketOrderPicker, { PedidoSeleccionado } from "@/components/TicketOrderPicker";
import { CATEGORIAS_TICKET, labelCategoria, CONDICIONES_IVA, CATEGORIAS_RAPIDAS } from "@/lib/ticketCategorias";

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
const PRIORIDADES = ["normal", "alta", "urgente"];
const PRIORIDAD_LABELS: Record<string, string> = { normal: "Normal", alta: "Alta", urgente: "Urgente" };
const CANALES_CONTACTO = ["WhatsApp", "Instagram", "Email", "Trusty", "Otro"];

// Tablero estilo Trello: los 10 estados reales se agrupan en 3 columnas fijas
// (mismo esquema visual que ya usa /soporte). Arrastrar una tarjeta a otra
// columna aplica el estado "default" de esa columna — si ya está en alguno
// de los estados de la columna (ej. "esperando_pago" dentro de "En
// proceso"), soltarla ahí adentro no la toca. Para elegir un estado más
// específico dentro de la columna, se sigue pudiendo hacer desde el detalle.
const COLUMNAS: { key: string; label: string; icon: string; color: string; estados: string[]; estadoDefault: string }[] = [
  { key: "pendiente", label: "Pendiente", icon: "fas fa-inbox", color: "#f59e0b", estados: ["nuevo", "pendiente_supervision"], estadoDefault: "nuevo" },
  { key: "en_proceso", label: "En proceso", icon: "fas fa-spinner", color: "#3b82f6", estados: ["en_gestion", "esperando_cliente", "esperando_pago", "esperando_devolucion", "esperando_logistica"], estadoDefault: "en_gestion" },
  { key: "resuelto", label: "Resuelto", icon: "fas fa-circle-check", color: "#10b981", estados: ["resuelto", "cerrado", "cancelado"], estadoDefault: "resuelto" },
];

interface Ticket {
  id: number;
  numero_pedido: string | null;
  cliente_nombre: string;
  canal_contacto: string | null;
  categoria: string;
  subcategoria_1: string | null;
  estado: string;
  prioridad: string;
  responsable_nombre: string | null;
  sla_vencimiento: string | null;
  created_at: string;
}

interface TicketCounts {
  totalAbiertos: number; pendientesSupervision: number; enGestion: number;
  esperandoCliente: number; esperandoDevolucion: number; urgentes: number; slaVencidos: number;
}

function fmtTiempoAbierto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / (1000 * 60 * 60));
  if (horas < 1) return "< 1h";
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}

function isVencido(slaVencimiento: string | null, estado: string): boolean {
  if (!slaVencimiento || ["resuelto", "cerrado", "cancelado"].includes(estado)) return false;
  return new Date(slaVencimiento).getTime() < Date.now();
}

// Formulario de creación (paso 2, tras elegir el pedido o el tipo rápido)
const EMPTY_CREAR_FORM = {
  categoria: "", subcategoria1: "", subcategoria2: "", canalContacto: "",
  clienteInstagram: "", descripcion: "", troubleshooting: "", prioridad: "normal",
  facturaCuit: "", facturaRazonSocial: "", facturaCondicionIva: "", facturaDireccionFiscal: "",
};
const EMPTY_MANUAL_FORM = { clienteNombre: "", clienteTelefono: "", clienteEmail: "", clienteDni: "" };

// Íconos para los botones rápidos del primer paso de "Crear Ticket" — el
// label sale de CATEGORIAS_TICKET (labelCategoria), acá solo el ícono.
const ICONOS_RAPIDOS: Record<string, string> = {
  hacer_factura: "fas fa-file-invoice",
  crear_orden_compra: "fas fa-cart-shopping",
  falla_producto: "fas fa-triangle-exclamation",
  cambio_direccion: "fas fa-location-dot",
};

interface Me { id: string; name: string; role: "admin" | "member"; ticketsPuedeSupervisar?: boolean; }

export default function TicketsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const [counts, setCounts] = useState<TicketCounts | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroCanal, setFiltroCanal] = useState("");
  const [filtroPrioridad, setFiltroPrioridad] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("");
  const [filtroProducto, setFiltroProducto] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const [showTipoPicker, setShowTipoPicker] = useState(false);
  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [modoManual, setModoManual] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoSeleccionado | null>(null);
  const [crearForm, setCrearForm] = useState(EMPTY_CREAR_FORM);
  const [adjuntos, setAdjuntos] = useState<{ url: string; publicId: string | null; resourceType: string; nombreArchivo: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const puedeSupervisar = me?.role === "admin" || !!me?.ticketsPuedeSupervisar;

  useEffect(() => {
    fetch("/api/user/me").then(r => r.json()).then(d => setMe(d.user ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busqueda), 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const fetchCounts = useCallback(async () => {
    const r = await fetch("/api/tickets/counts");
    if (r.ok) setCounts((await r.json()).counts ?? null);
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      if (filtroEstado) params.set("estado", filtroEstado);
      if (filtroCategoria) params.set("categoria", filtroCategoria);
      if (filtroCanal) params.set("canal", filtroCanal);
      if (filtroPrioridad) params.set("prioridad", filtroPrioridad);
      if (filtroMarca) params.set("marca", filtroMarca);
      if (filtroProducto) params.set("producto", filtroProducto);
      if (fechaDesde) params.set("fecha_desde", fechaDesde);
      if (fechaHasta) params.set("fecha_hasta", fechaHasta);
      const r = await fetch(`/api/tickets?${params}`);
      if (r.ok) setTickets((await r.json()).tickets ?? []);
    } finally {
      setLoading(false);
    }
  }, [debounced, filtroEstado, filtroCategoria, filtroCanal, filtroPrioridad, filtroMarca, filtroProducto, fechaDesde, fechaHasta]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // ── Tablero (drag & drop) ────────────────────────────────────────────────

  async function moveTicket(ticket: Ticket, nuevoEstado: string) {
    setMovingId(ticket.id);
    try {
      const r = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (r.ok) {
        const { ticket: updated } = await r.json();
        setTickets(prev => prev.map(t => (t.id === updated.id ? { ...t, estado: updated.estado } : t)));
        fetchCounts();
      } else {
        const d = await r.json().catch(() => null);
        alert(d?.error ?? "No se pudo mover el ticket");
      }
    } finally {
      setMovingId(null);
    }
  }

  async function borrarTicket(ticket: Ticket) {
    if (!confirm(`¿Eliminar el ticket #${ticket.id} por completo? No se puede deshacer. Para un caso terminado, mejor pasalo a Cancelado en vez de borrarlo.`)) return;
    const res = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
    if (res.ok) {
      setTickets(prev => prev.filter(t => t.id !== ticket.id));
      fetchCounts();
    } else {
      alert((await res.json().catch(() => null))?.error ?? "No se pudo eliminar");
    }
  }

  function handleDragStart(e: React.DragEvent, ticketId: number) {
    setDraggingId(ticketId);
    e.dataTransfer.setData("text/plain", String(ticketId));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverKey(null);
  }

  function handleColDragOver(e: React.DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverKey !== key) setDragOverKey(key);
  }

  function handleColDragLeave(key: string) {
    setDragOverKey(prev => (prev === key ? null : prev));
  }

  function handleDrop(e: React.DragEvent, col: typeof COLUMNAS[number]) {
    e.preventDefault();
    setDragOverKey(null);
    setDraggingId(null);
    const ticketId = Number(e.dataTransfer.getData("text/plain"));
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    if (col.estados.includes(ticket.estado)) return;
    moveTicket(ticket, col.estadoDefault);
  }

  // ── Crear ticket ──────────────────────────────────────────────────────────

  function onPedidoElegido(pedido: PedidoSeleccionado) {
    setPedidoSeleccionado(pedido);
    setShowOrderPicker(false);
    // Preserva la categoría si vino de un botón rápido (ver elegirTipoRapido).
    setCrearForm(f => ({ ...EMPTY_CREAR_FORM, categoria: f.categoria }));
    setAdjuntos([]);
  }

  // ── Paso 1: elegir el tipo de ticket ─────────────────────────────────────

  function elegirTipoRapido(categoria: string) {
    setShowTipoPicker(false);
    setAdjuntos([]);
    if (categoria === "crear_orden_compra") {
      // Única categoría sin pedido vinculado: por definición el pedido
      // todavía no existe, así que no tiene sentido buscarlo.
      setModoManual(true);
      setManualForm(EMPTY_MANUAL_FORM);
      setPedidoSeleccionado(null);
      setCrearForm({ ...EMPTY_CREAR_FORM, categoria });
    } else {
      setModoManual(false);
      setCrearForm({ ...EMPTY_CREAR_FORM, categoria });
      setShowOrderPicker(true);
    }
  }

  function elegirOtraCategoria() {
    setShowTipoPicker(false);
    setModoManual(false);
    setAdjuntos([]);
    setCrearForm(EMPTY_CREAR_FORM);
    setShowOrderPicker(true);
  }

  function cerrarModalDetalle() {
    setPedidoSeleccionado(null);
    setModoManual(false);
  }

  async function subirArchivo(file: File) {
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
      const resourceType: string = data.resource_type === "video" ? "video" : data.resource_type === "raw" ? "raw" : "image";
      setAdjuntos(prev => [...prev, { url: data.secure_url, publicId: data.public_id, resourceType, nombreArchivo: file.name }]);
    } catch {
      alert("No se pudo subir el archivo. Probá de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(f => subirArchivo(f));
  }

  function quitarAdjunto(idx: number) {
    setAdjuntos(prev => prev.filter((_, i) => i !== idx));
  }

  const categoriaSeleccionada = CATEGORIAS_TICKET.find(c => c.valor === crearForm.categoria);
  const sub1Seleccionada = categoriaSeleccionada?.subcategorias?.find(s => s.valor === crearForm.subcategoria1);

  async function crearTicket() {
    if (!crearForm.categoria) return;
    if (modoManual) {
      if (!manualForm.clienteNombre.trim()) { alert("Falta el nombre del cliente"); return; }
    } else if (!pedidoSeleccionado) {
      return;
    }
    setCreando(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canalPedido: modoManual ? null : pedidoSeleccionado!.canalPedido,
          numeroPedido: modoManual ? null : pedidoSeleccionado!.numeroPedido,
          pedidoIdInterno: modoManual ? null : pedidoSeleccionado!.pedidoIdInterno,
          clienteNombre: modoManual ? manualForm.clienteNombre.trim() : pedidoSeleccionado!.clienteNombre,
          clienteTelefono: modoManual ? (manualForm.clienteTelefono.trim() || null) : pedidoSeleccionado!.clienteTelefono,
          clienteEmail: modoManual ? (manualForm.clienteEmail.trim() || null) : pedidoSeleccionado!.clienteEmail,
          clienteDni: modoManual ? (manualForm.clienteDni.trim() || null) : pedidoSeleccionado!.clienteDni,
          clienteDireccion: modoManual ? null : pedidoSeleccionado!.clienteDireccion,
          pedidoTotal: modoManual ? null : pedidoSeleccionado!.pedidoTotal,
          pedidoMoneda: modoManual ? null : pedidoSeleccionado!.pedidoMoneda,
          pedidoFecha: modoManual ? null : pedidoSeleccionado!.pedidoFecha,
          pedidoEstado: modoManual ? null : pedidoSeleccionado!.pedidoEstado,
          pedidoTransportista: modoManual ? null : pedidoSeleccionado!.pedidoTransportista,
          pedidoTracking: modoManual ? null : pedidoSeleccionado!.pedidoTracking,
          pedidoProductos: modoManual ? [] : pedidoSeleccionado!.pedidoProductos,
          categoria: crearForm.categoria,
          subcategoria1: crearForm.subcategoria1 || null,
          subcategoria2: crearForm.subcategoria2 || null,
          canalContacto: crearForm.canalContacto || null,
          clienteInstagram: crearForm.clienteInstagram || null,
          descripcion: crearForm.descripcion || null,
          troubleshooting: crearForm.troubleshooting || null,
          facturaCuit: crearForm.facturaCuit || null,
          facturaRazonSocial: crearForm.facturaRazonSocial || null,
          facturaCondicionIva: crearForm.facturaCondicionIva || null,
          facturaDireccionFiscal: crearForm.facturaDireccionFiscal || null,
          prioridad: crearForm.prioridad,
          adjuntos,
        }),
      });
      if (res.ok) {
        const { ticket } = await res.json();
        router.push(`/tickets/${ticket.id}`);
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? "No se pudo crear el ticket");
      }
    } finally {
      setCreando(false);
    }
  }

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Tickets de Soporte</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Arrastrá las tarjetas entre columnas para cambiar el estado del ticket.
              </p>
            </div>
            <button className="sf-btn" onClick={() => setShowTipoPicker(true)}>
              <i className="fas fa-plus" /> Crear Ticket
            </button>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <TicketStatCards counts={counts} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
              <i className="fas fa-magnifying-glass" style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.8rem" }} />
              <input
                className="sf-input" style={{ paddingLeft: "2rem" }}
                placeholder="Buscar por ticket, pedido, nombre, teléfono, email, DNI o tracking..."
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <select className="sf-input" style={{ maxWidth: 190 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS.map(e => <option key={e} value={e}>{ESTADOS_LABELS[e]}</option>)}
            </select>
            <select className="sf-input" style={{ maxWidth: 190 }} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="">Toda categoría</option>
              {CATEGORIAS_TICKET.map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
            </select>
            <select className="sf-input" style={{ maxWidth: 160 }} value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)}>
              <option value="">Todo canal</option>
              {CANALES_CONTACTO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="sf-input" style={{ maxWidth: 150 }} value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)}>
              <option value="">Toda prioridad</option>
              {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>)}
            </select>
            <input className="sf-input" style={{ maxWidth: 150 }} placeholder="Marca" value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)} />
            <input className="sf-input" style={{ maxWidth: 170 }} placeholder="Producto / SKU" value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} />
            <input className="sf-input" style={{ maxWidth: 150 }} type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} title="Desde" />
            <input className="sf-input" style={{ maxWidth: 150 }} type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} title="Hasta" />
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
            </div>
          ) : tickets.length === 0 ? (
            <div className="sf-empty">
              <i className="fas fa-ticket sf-empty-icon" />
              <p style={{ fontWeight: 600, color: "var(--text-muted)" }}>No hay tickets para este filtro</p>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "1rem", overflowX: "auto", alignItems: "flex-start" }}>
              {COLUMNAS.map(col => {
                const items = tickets.filter(t => col.estados.includes(t.estado));
                const isDragOver = dragOverKey === col.key;
                return (
                  <div
                    key={col.key}
                    onDragOver={e => handleColDragOver(e, col.key)}
                    onDragLeave={() => handleColDragLeave(col.key)}
                    onDrop={e => handleDrop(e, col)}
                    style={{
                      flex: "1 1 0", minWidth: 280, borderRadius: "var(--radius)",
                      background: "rgba(15,23,42,0.35)", border: "1px solid var(--border-color)", padding: "0.85rem",
                      outline: isDragOver ? "2px dashed var(--primary-color)" : "2px dashed transparent",
                      outlineOffset: 2, transition: "outline-color 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <i className={col.icon} style={{ color: col.color }} />
                      <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{col.label}</span>
                      <span className="sf-tab-badge" style={{ marginLeft: "auto" }}>{items.length}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minHeight: 40 }}>
                      {items.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.8rem", border: "1px dashed var(--border-color)", borderRadius: "var(--radius)" }}>
                          Sin tickets
                        </div>
                      ) : (
                        items.map(t => (
                          <TicketCardKanban
                            key={t.id}
                            t={t}
                            vencido={isVencido(t.sla_vencimiento, t.estado)}
                            isDragging={draggingId === t.id}
                            isMoving={movingId === t.id}
                            puedeEliminar={puedeSupervisar}
                            onClick={() => router.push(`/tickets/${t.id}`)}
                            onDragStart={e => handleDragStart(e, t.id)}
                            onDragEnd={handleDragEnd}
                            onDelete={() => borrarTicket(t)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>

      {showTipoPicker && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setShowTipoPicker(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(440px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title"><i className="fas fa-ticket" style={{ color: "var(--primary-color)" }} /> Nuevo ticket</h3>
              <button className="sf-close-btn" onClick={() => setShowTipoPicker(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>¿Qué tipo de ticket es?</p>
              {CATEGORIAS_RAPIDAS.map(valor => (
                <button key={valor} className="sf-btn" style={{ justifyContent: "flex-start" }} onClick={() => elegirTipoRapido(valor)}>
                  <i className={ICONOS_RAPIDOS[valor]} /> {labelCategoria(valor)}
                </button>
              ))}
              <button className="sf-btn sf-btn-secondary" style={{ justifyContent: "flex-start", marginTop: "0.4rem" }} onClick={elegirOtraCategoria}>
                <i className="fas fa-ellipsis" /> Otra categoría
              </button>
            </div>
          </div>
        </>
      )}

      {showOrderPicker && (
        <TicketOrderPicker onSelect={onPedidoElegido} onClose={() => setShowOrderPicker(false)} />
      )}

      {(pedidoSeleccionado || modoManual) && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !creando && cerrarModalDetalle()} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(600px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-ticket" style={{ color: "var(--primary-color)" }} />
                {modoManual ? "Nuevo ticket — Crear orden de compra" : `Nuevo ticket — Pedido #${pedidoSeleccionado!.numeroPedido}`}
              </h3>
              <button className="sf-close-btn" onClick={() => !creando && cerrarModalDetalle()}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {modoManual ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <label className="sf-label">Nombre del cliente
                    <input className="sf-input" value={manualForm.clienteNombre} onChange={e => setManualForm(f => ({ ...f, clienteNombre: e.target.value }))} placeholder="Nombre y apellido" autoFocus />
                  </label>
                  <label className="sf-label">Teléfono
                    <input className="sf-input" value={manualForm.clienteTelefono} onChange={e => setManualForm(f => ({ ...f, clienteTelefono: e.target.value }))} placeholder="Opcional" />
                  </label>
                  <label className="sf-label">Email
                    <input className="sf-input" value={manualForm.clienteEmail} onChange={e => setManualForm(f => ({ ...f, clienteEmail: e.target.value }))} placeholder="Opcional" />
                  </label>
                  <label className="sf-label">DNI
                    <input className="sf-input" value={manualForm.clienteDni} onChange={e => setManualForm(f => ({ ...f, clienteDni: e.target.value }))} placeholder="Opcional" />
                  </label>
                </div>
              ) : (
                <div className="sf-info-block">
                  <div className="sf-info-block-title">Datos importados del pedido</div>
                  <div className="sf-info-block-grid">
                    <div><strong>Cliente:</strong> {pedidoSeleccionado!.clienteNombre || "—"}</div>
                    <div><strong>Teléfono:</strong> {pedidoSeleccionado!.clienteTelefono || "—"}</div>
                    <div><strong>Email:</strong> {pedidoSeleccionado!.clienteEmail || "—"}</div>
                    <div><strong>DNI:</strong> {pedidoSeleccionado!.clienteDni || "—"}</div>
                    <div style={{ gridColumn: "1 / -1" }}><strong>Dirección:</strong> {pedidoSeleccionado!.clienteDireccion || "—"}</div>
                    <div><strong>Total:</strong> {pedidoSeleccionado!.pedidoTotal != null ? `${pedidoSeleccionado!.pedidoMoneda} ${pedidoSeleccionado!.pedidoTotal.toLocaleString("es-AR")}` : "—"}</div>
                    <div><strong>Transportista:</strong> {pedidoSeleccionado!.pedidoTransportista || "—"}</div>
                    <div><strong>Tracking:</strong> {pedidoSeleccionado!.pedidoTracking || "—"}</div>
                    <div><strong>Estado:</strong> {pedidoSeleccionado!.pedidoEstado || "—"}</div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <strong>Productos:</strong> {pedidoSeleccionado!.pedidoProductos.length
                        ? pedidoSeleccionado!.pedidoProductos.map(p => `${p.nombre}${p.cantidad > 1 ? ` x${p.cantidad}` : ""}`).join(", ")
                        : "—"}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Categoría
                  <select className="sf-input" value={crearForm.categoria} onChange={e => setCrearForm(f => ({ ...f, categoria: e.target.value, subcategoria1: "", subcategoria2: "" }))}>
                    <option value="">Seleccionar...</option>
                    {CATEGORIAS_TICKET.map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                  </select>
                </label>
                <label className="sf-label">
                  Prioridad
                  <select className="sf-input" value={crearForm.prioridad} onChange={e => setCrearForm(f => ({ ...f, prioridad: e.target.value }))}>
                    {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>)}
                  </select>
                </label>
              </div>

              {!!categoriaSeleccionada?.subcategorias?.length && (
                <div style={{ display: "grid", gridTemplateColumns: sub1Seleccionada?.subcategorias?.length ? "1fr 1fr" : "1fr", gap: "0.75rem" }}>
                  <label className="sf-label">
                    {categoriaSeleccionada.valor === "falla_producto" ? "Producto afectado" : "Subcategoría"}
                    <select className="sf-input" value={crearForm.subcategoria1} onChange={e => setCrearForm(f => ({ ...f, subcategoria1: e.target.value, subcategoria2: "" }))}>
                      <option value="">Seleccionar...</option>
                      {categoriaSeleccionada.subcategorias.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                    </select>
                  </label>
                  {!!sub1Seleccionada?.subcategorias?.length && (
                    <label className="sf-label">
                      Tipo de falla
                      <select className="sf-input" value={crearForm.subcategoria2} onChange={e => setCrearForm(f => ({ ...f, subcategoria2: e.target.value }))}>
                        <option value="">Seleccionar...</option>
                        {sub1Seleccionada.subcategorias.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {crearForm.categoria === "hacer_factura" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", border: "1px dashed var(--border-color)", borderRadius: "var(--radius)", padding: "0.75rem" }}>
                  <label className="sf-label">CUIT
                    <input className="sf-input" value={crearForm.facturaCuit} onChange={e => setCrearForm(f => ({ ...f, facturaCuit: e.target.value }))} placeholder="Ej: 20304050607" />
                  </label>
                  <label className="sf-label">Razón Social
                    <input className="sf-input" value={crearForm.facturaRazonSocial} onChange={e => setCrearForm(f => ({ ...f, facturaRazonSocial: e.target.value }))} />
                  </label>
                  <label className="sf-label">Condición frente al IVA
                    <select className="sf-input" value={crearForm.facturaCondicionIva} onChange={e => setCrearForm(f => ({ ...f, facturaCondicionIva: e.target.value }))}>
                      <option value="">Seleccionar...</option>
                      {CONDICIONES_IVA.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="sf-label">Dirección fiscal
                    <input className="sf-input" value={crearForm.facturaDireccionFiscal} onChange={e => setCrearForm(f => ({ ...f, facturaDireccionFiscal: e.target.value }))} />
                  </label>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: crearForm.canalContacto === "Instagram" ? "1fr 1fr" : "1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Canal de contacto
                  <select className="sf-input" value={crearForm.canalContacto} onChange={e => setCrearForm(f => ({ ...f, canalContacto: e.target.value }))}>
                    <option value="">Sin especificar</option>
                    {CANALES_CONTACTO.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                {crearForm.canalContacto === "Instagram" && (
                  <label className="sf-label">
                    Usuario de Instagram
                    <input className="sf-input" value={crearForm.clienteInstagram} onChange={e => setCrearForm(f => ({ ...f, clienteInstagram: e.target.value }))} placeholder="@usuario" />
                  </label>
                )}
              </div>

              <label className="sf-label">
                Descripción
                <textarea className="sf-input" rows={3} value={crearForm.descripcion} onChange={e => setCrearForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Qué reportó el cliente..." style={{ resize: "vertical", fontFamily: "inherit" }} />
              </label>
              <label className="sf-label">
                Troubleshooting ya realizado
                <textarea className="sf-input" rows={2} value={crearForm.troubleshooting} onChange={e => setCrearForm(f => ({ ...f, troubleshooting: e.target.value }))} placeholder="Qué ya se probó con el cliente antes de derivar..." style={{ resize: "vertical", fontFamily: "inherit" }} />
              </label>

              <label className="sf-label">
                {crearForm.categoria === "crear_orden_compra" ? "Comprobante de pago" : "Adjuntos"}
                <div
                  className="sf-dropzone"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
                  {subiendo ? (
                    <><i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem", color: "var(--primary-color)" }} /><span style={{ fontWeight: 600 }}>Subiendo…</span></>
                  ) : crearForm.categoria === "crear_orden_compra" ? (
                    <><i className="fas fa-cloud-arrow-up" style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} /><span style={{ fontWeight: 600 }}>Subí el comprobante de pago</span></>
                  ) : (
                    <><i className="fas fa-cloud-arrow-up" style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} /><span style={{ fontWeight: 600 }}>Fotos, videos, capturas, audios o archivos</span></>
                  )}
                </div>
              </label>
              {adjuntos.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {adjuntos.map((a, idx) => (
                    <div key={a.url} style={{ position: "relative" }}>
                      {a.resourceType === "image" ? (
                        <img src={a.url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
                      ) : (
                        <div style={{ width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", fontSize: "1.2rem", color: "var(--text-muted)" }}>
                          <i className={a.resourceType === "video" ? "fas fa-film" : "fas fa-file"} />
                        </div>
                      )}
                      <button type="button" onClick={() => quitarAdjunto(idx)} title="Quitar" style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "var(--error-color)", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.65rem", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={cerrarModalDetalle} disabled={creando}>Cancelar</button>
              <button className="sf-btn" onClick={crearTicket} disabled={creando || !crearForm.categoria || subiendo}>
                {creando ? <><i className="fas fa-spinner fa-spin" /> Creando...</> : <><i className="fas fa-check" /> Crear Ticket</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TicketCardKanban({
  t, vencido, isDragging, isMoving, puedeEliminar, onClick, onDragStart, onDragEnd, onDelete,
}: {
  t: Ticket;
  vencido: boolean;
  isDragging: boolean;
  isMoving: boolean;
  puedeEliminar: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter") onClick(); }}
      style={{
        textAlign: "left", background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)",
        borderRadius: "var(--radius)", padding: "0.85rem", cursor: "grab", display: "flex", flexDirection: "column", gap: "0.5rem",
        color: "var(--text-color)", font: "inherit", opacity: isDragging ? 0.4 : 1, position: "relative",
      }}
    >
      {isMoving && (
        <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius)", background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="fas fa-spinner fa-spin" style={{ color: "var(--primary-color)" }} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--primary-color)" }}>#{t.id}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {vencido && (
            <span className="sf-badge sf-badge-error" style={{ fontSize: "0.65rem" }}>
              <i className="fas fa-triangle-exclamation" /> SLA vencido
            </span>
          )}
          {puedeEliminar && (
            <button
              className="sf-icon-btn danger"
              title="Eliminar ticket"
              draggable={false}
              onDragStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ padding: "0.2rem 0.35rem", fontSize: "0.7rem" }}
            >
              <i className="fas fa-trash" />
            </button>
          )}
        </div>
      </div>
      <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{t.cliente_nombre || "—"}</span>
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{t.numero_pedido ? `Pedido #${t.numero_pedido}` : "Sin pedido"}</span>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="sf-badge" style={{ fontSize: "0.7rem" }}>{labelCategoria(t.categoria)}</span>
        <span
          className="sf-badge"
          style={{
            fontSize: "0.7rem",
            background: (ESTADO_COLORS[t.estado] ?? "#94a3b8") + "22", color: ESTADO_COLORS[t.estado] ?? "#94a3b8",
            border: `1px solid ${ESTADO_COLORS[t.estado] ?? "#94a3b8"}44`,
          }}
        >
          {ESTADOS_LABELS[t.estado] ?? t.estado}
        </span>
        {t.prioridad !== "normal" && (
          <span className={`sf-badge ${t.prioridad === "urgente" ? "sf-badge-error" : "sf-badge-warning"}`} style={{ fontSize: "0.7rem" }}>
            {PRIORIDAD_LABELS[t.prioridad] ?? t.prioridad}
          </span>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "var(--text-muted)" }}>
        <span>{t.responsable_nombre ? <><i className="fas fa-user" /> {t.responsable_nombre}</> : "Sin asignar"}</span>
        <span>{fmtTiempoAbierto(t.created_at)}</span>
      </div>
    </div>
  );
}
