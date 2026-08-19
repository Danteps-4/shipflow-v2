"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import TicketStatCards from "@/components/TicketStatCards";
import TicketOrderPicker, { PedidoSeleccionado } from "@/components/TicketOrderPicker";
import { CATEGORIAS_TICKET, labelCategoria, labelSubcategoria1 } from "@/lib/ticketCategorias";

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
const PRIORIDADES = ["normal", "alta", "urgente"];
const PRIORIDAD_LABELS: Record<string, string> = { normal: "Normal", alta: "Alta", urgente: "Urgente" };
const CANALES_CONTACTO = ["WhatsApp", "Instagram", "Email", "Trusty", "Otro"];

interface Ticket {
  id: number;
  numero_pedido: string;
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

// Formulario de creación (paso 2, tras elegir el pedido)
const EMPTY_CREAR_FORM = {
  categoria: "", subcategoria1: "", subcategoria2: "", canalContacto: "",
  descripcion: "", troubleshooting: "", prioridad: "normal",
};

export default function TicketsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoSeleccionado | null>(null);
  const [crearForm, setCrearForm] = useState(EMPTY_CREAR_FORM);
  const [adjuntos, setAdjuntos] = useState<{ url: string; publicId: string | null; resourceType: string; nombreArchivo: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Crear ticket ──────────────────────────────────────────────────────────

  function onPedidoElegido(pedido: PedidoSeleccionado) {
    setPedidoSeleccionado(pedido);
    setShowOrderPicker(false);
    setCrearForm(EMPTY_CREAR_FORM);
    setAdjuntos([]);
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
    if (!pedidoSeleccionado || !crearForm.categoria) return;
    setCreando(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canalPedido: pedidoSeleccionado.canalPedido,
          numeroPedido: pedidoSeleccionado.numeroPedido,
          pedidoIdInterno: pedidoSeleccionado.pedidoIdInterno,
          clienteNombre: pedidoSeleccionado.clienteNombre,
          clienteTelefono: pedidoSeleccionado.clienteTelefono,
          clienteEmail: pedidoSeleccionado.clienteEmail,
          clienteDni: pedidoSeleccionado.clienteDni,
          clienteDireccion: pedidoSeleccionado.clienteDireccion,
          pedidoTotal: pedidoSeleccionado.pedidoTotal,
          pedidoMoneda: pedidoSeleccionado.pedidoMoneda,
          pedidoFecha: pedidoSeleccionado.pedidoFecha,
          pedidoEstado: pedidoSeleccionado.pedidoEstado,
          pedidoTransportista: pedidoSeleccionado.pedidoTransportista,
          pedidoTracking: pedidoSeleccionado.pedidoTracking,
          pedidoProductos: pedidoSeleccionado.pedidoProductos,
          categoria: crearForm.categoria,
          subcategoria1: crearForm.subcategoria1 || null,
          subcategoria2: crearForm.subcategoria2 || null,
          canalContacto: crearForm.canalContacto || null,
          descripcion: crearForm.descripcion || null,
          troubleshooting: crearForm.troubleshooting || null,
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
                Casos vinculados a pedidos reales, con acciones, costos e historial.
              </p>
            </div>
            <button className="sf-btn" onClick={() => setShowOrderPicker(true)}>
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
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead>
                  <tr>
                    <th>N° Ticket</th>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Canal</th>
                    <th>Categoría</th>
                    <th>Subcategoría</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>Responsable</th>
                    <th>Abierto</th>
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t, i) => {
                    const vencido = isVencido(t.sla_vencimiento, t.estado);
                    return (
                      <tr key={t.id} className={i % 2 === 0 ? "row-even" : "row-odd"} style={{ cursor: "pointer" }} onClick={() => router.push(`/tickets/${t.id}`)}>
                        <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary-color)" }}>#{t.id}</td>
                        <td style={{ fontFamily: "monospace" }}>#{t.numero_pedido}</td>
                        <td>{t.cliente_nombre || "—"}</td>
                        <td>{t.canal_contacto || "—"}</td>
                        <td style={{ fontSize: "0.82rem" }}>{labelCategoria(t.categoria)}</td>
                        <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{t.subcategoria_1 ? labelSubcategoria1(t.categoria, t.subcategoria_1) : "—"}</td>
                        <td><span className="sf-badge">{ESTADOS_LABELS[t.estado] ?? t.estado}</span></td>
                        <td>
                          <span className={`sf-badge ${t.prioridad === "urgente" ? "sf-badge-error" : t.prioridad === "alta" ? "sf-badge-warning" : ""}`}>
                            {PRIORIDAD_LABELS[t.prioridad] ?? t.prioridad}
                          </span>
                        </td>
                        <td>{t.responsable_nombre || "—"}</td>
                        <td>{fmtTiempoAbierto(t.created_at)}</td>
                        <td>
                          {vencido
                            ? <span className="sf-badge sf-badge-error"><i className="fas fa-triangle-exclamation" /> Vencido</span>
                            : <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>OK</span>}
                        </td>
                      </tr>
                    );
                  })}
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

      {showOrderPicker && (
        <TicketOrderPicker onSelect={onPedidoElegido} onClose={() => setShowOrderPicker(false)} />
      )}

      {pedidoSeleccionado && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !creando && setPedidoSeleccionado(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(600px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-ticket" style={{ color: "var(--primary-color)" }} />
                Nuevo ticket — Pedido #{pedidoSeleccionado.numeroPedido}
              </h3>
              <button className="sf-close-btn" onClick={() => !creando && setPedidoSeleccionado(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="sf-info-block">
                <div className="sf-info-block-title">Datos importados del pedido</div>
                <div className="sf-info-block-grid">
                  <div><strong>Cliente:</strong> {pedidoSeleccionado.clienteNombre || "—"}</div>
                  <div><strong>Teléfono:</strong> {pedidoSeleccionado.clienteTelefono || "—"}</div>
                  <div><strong>Email:</strong> {pedidoSeleccionado.clienteEmail || "—"}</div>
                  <div><strong>DNI:</strong> {pedidoSeleccionado.clienteDni || "—"}</div>
                  <div style={{ gridColumn: "1 / -1" }}><strong>Dirección:</strong> {pedidoSeleccionado.clienteDireccion || "—"}</div>
                  <div><strong>Total:</strong> {pedidoSeleccionado.pedidoTotal != null ? `${pedidoSeleccionado.pedidoMoneda} ${pedidoSeleccionado.pedidoTotal.toLocaleString("es-AR")}` : "—"}</div>
                  <div><strong>Transportista:</strong> {pedidoSeleccionado.pedidoTransportista || "—"}</div>
                  <div><strong>Tracking:</strong> {pedidoSeleccionado.pedidoTracking || "—"}</div>
                  <div><strong>Estado:</strong> {pedidoSeleccionado.pedidoEstado || "—"}</div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <strong>Productos:</strong> {pedidoSeleccionado.pedidoProductos.length
                      ? pedidoSeleccionado.pedidoProductos.map(p => `${p.nombre}${p.cantidad > 1 ? ` x${p.cantidad}` : ""}`).join(", ")
                      : "—"}
                  </div>
                </div>
              </div>

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

              <label className="sf-label">
                Canal de contacto
                <select className="sf-input" value={crearForm.canalContacto} onChange={e => setCrearForm(f => ({ ...f, canalContacto: e.target.value }))}>
                  <option value="">Sin especificar</option>
                  {CANALES_CONTACTO.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label className="sf-label">
                Descripción
                <textarea className="sf-input" rows={3} value={crearForm.descripcion} onChange={e => setCrearForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Qué reportó el cliente..." style={{ resize: "vertical", fontFamily: "inherit" }} />
              </label>
              <label className="sf-label">
                Troubleshooting ya realizado
                <textarea className="sf-input" rows={2} value={crearForm.troubleshooting} onChange={e => setCrearForm(f => ({ ...f, troubleshooting: e.target.value }))} placeholder="Qué ya se probó con el cliente antes de derivar..." style={{ resize: "vertical", fontFamily: "inherit" }} />
              </label>

              <label className="sf-label">
                Adjuntos
                <div
                  className="sf-dropzone"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
                  {subiendo ? (
                    <><i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem", color: "var(--primary-color)" }} /><span style={{ fontWeight: 600 }}>Subiendo…</span></>
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
              <button className="sf-btn sf-btn-secondary" onClick={() => setPedidoSeleccionado(null)} disabled={creando}>Cancelar</button>
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
