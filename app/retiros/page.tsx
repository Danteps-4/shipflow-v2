"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import RetiroStatCards from "@/components/RetiroStatCards";
import RetiroOrderPicker, { PedidoRetiroSeleccionado, ProductoPedidoRetiro } from "@/components/RetiroOrderPicker";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Retiro {
  id: number;
  codigo: string;
  canal_pedido: "tiendanube" | "mercadolibre" | null;
  numero_pedido: string | null;
  cliente_nombre: string;
  productos_json: { sku: string | null; nombre: string; cantidad: number; precio: number | null }[];
  total: string;
  estado_retiro: string;
  estado_pago: string;
  fecha_estimada: string | null;
  created_at: string;
}

interface RetiroCounts {
  pendientesPreparar: number; listos: number; paraHoy: number; cobrosPendientes: number;
}

const ESTADO_RETIRO_LABELS: Record<string, string> = {
  pendiente_preparar: "Pendiente de preparar",
  listo: "Listo para retirar",
  retirado: "Retirado",
  cancelado: "Cancelado",
};
const ESTADO_RETIRO_COLORS: Record<string, string> = {
  pendiente_preparar: "#94a3b8",
  listo: "#3b82f6",
  retirado: "#22c55e",
  cancelado: "#64748b",
};
const ESTADO_PAGO_LABELS: Record<string, string> = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  cobrar_al_retirar: "Cobrar al retirar",
};
const ESTADO_PAGO_COLORS: Record<string, string> = {
  pagado: "#22c55e",
  pendiente: "#eab308",
  cobrar_al_retirar: "#ef4444",
};
const CANAL_LABELS: Record<string, string> = { tiendanube: "Tienda Nube", mercadolibre: "Mercado Libre" };
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
  if (!iso) return "Sin fecha";
  // Neon devuelve las columnas DATE como timestamp ISO completo
  // (ej. "2026-08-26T03:00:00.000Z"), no como "YYYY-MM-DD" puro.
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
function hoyStr() { return new Date().toISOString().slice(0, 10); }
function mananaStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

interface ProductoManual { sku: string; nombre: string; cantidad: string; precio: string }
const PRODUCTO_VACIO: ProductoManual = { sku: "", nombre: "", cantidad: "1", precio: "" };

export default function RetirosPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [counts, setCounts] = useState<RetiroCounts | null>(null);
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filtroEstadoRetiro, setFiltroEstadoRetiro] = useState("");
  const [filtroEstadoPago, setFiltroEstadoPago] = useState("");
  const [filtroCanal, setFiltroCanal] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");

  // ── Flujo de creación ───────────────────────────────────────────────────
  const [showElegirOrigen, setShowElegirOrigen] = useState(false);
  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [pedidoVinculado, setPedidoVinculado] = useState<PedidoRetiroSeleccionado | null>(null);
  const [showFormManual, setShowFormManual] = useState(false);

  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteDni, setClienteDni] = useState("");
  const [productos, setProductos] = useState<ProductoManual[]>([{ ...PRODUCTO_VACIO }]);
  const [metodoPago, setMetodoPago] = useState<"pagar_ahora" | "pagar_al_retirar">("pagar_al_retirar");
  const [medioPago, setMedioPago] = useState("");
  const [fechaEstimada, setFechaEstimada] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorCreacion, setErrorCreacion] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(busqueda), 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const fetchCounts = useCallback(async () => {
    const r = await fetch("/api/retiros/counts");
    if (r.ok) setCounts((await r.json()).counts ?? null);
  }, []);

  const fetchRetiros = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      if (filtroEstadoRetiro) params.set("estado_retiro", filtroEstadoRetiro);
      if (filtroEstadoPago) params.set("estado_pago", filtroEstadoPago);
      if (filtroCanal) params.set("canal", filtroCanal);
      if (filtroFecha) params.set("fecha", filtroFecha);
      const r = await fetch(`/api/retiros?${params}`);
      if (r.ok) setRetiros((await r.json()).retiros ?? []);
    } finally {
      setLoading(false);
    }
  }, [debounced, filtroEstadoRetiro, filtroEstadoPago, filtroCanal, filtroFecha]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchRetiros(); }, [fetchRetiros]);

  // ── Crear retiro ─────────────────────────────────────────────────────────

  function abrirCrear() {
    setErrorCreacion(null);
    setPedidoVinculado(null);
    setShowFormManual(false);
    setClienteNombre(""); setClienteTelefono(""); setClienteEmail(""); setClienteDni("");
    setProductos([{ ...PRODUCTO_VACIO }]);
    setMetodoPago("pagar_al_retirar");
    setMedioPago("");
    setFechaEstimada(null);
    setNotas("");
    setShowElegirOrigen(true);
  }

  function elegirVinculado() {
    setShowElegirOrigen(false);
    setShowOrderPicker(true);
  }

  function elegirManual() {
    setShowElegirOrigen(false);
    setShowFormManual(true);
  }

  function onPedidoElegido(pedido: PedidoRetiroSeleccionado) {
    setPedidoVinculado(pedido);
    setShowOrderPicker(false);
    setShowFormManual(true);
  }

  function agregarProductoRow() {
    setProductos(prev => [...prev, { ...PRODUCTO_VACIO }]);
  }
  function quitarProductoRow(i: number) {
    setProductos(prev => prev.filter((_, idx) => idx !== i));
  }
  function editarProductoRow(i: number, campo: keyof ProductoManual, valor: string) {
    setProductos(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p));
  }

  const productosEfectivos: ProductoPedidoRetiro[] = pedidoVinculado
    ? pedidoVinculado.pedidoProductos
    : productos
        .filter(p => p.nombre.trim())
        .map(p => ({ sku: p.sku.trim() || null, nombre: p.nombre.trim(), cantidad: Number(p.cantidad) || 1, precio: p.precio ? Number(p.precio) : null }));

  const totalEfectivo = productosEfectivos.reduce((s, p) => s + p.cantidad * (p.precio ?? 0), 0);
  const yaPagado = !!pedidoVinculado?.pagado;

  async function confirmarCrear() {
    const nombre = pedidoVinculado?.clienteNombre || clienteNombre;
    if (!nombre.trim()) { setErrorCreacion("Falta el nombre del cliente."); return; }
    if (!productosEfectivos.length) { setErrorCreacion("Agregá al menos un producto."); return; }

    setCreando(true);
    setErrorCreacion(null);
    try {
      const res = await fetch("/api/retiros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canalPedido: pedidoVinculado?.canalPedido ?? null,
          numeroPedido: pedidoVinculado?.numeroPedido ?? null,
          pedidoIdInterno: pedidoVinculado?.pedidoIdInterno ?? null,
          pedidoPagadoOriginal: pedidoVinculado?.pagado ?? null,
          pedidoMetodoEntregaOriginal: pedidoVinculado?.metodoEntregaOriginal ?? null,
          pedidoTrackingOriginal: pedidoVinculado?.trackingOriginal ?? null,
          clienteNombre: nombre,
          clienteTelefono: pedidoVinculado?.clienteTelefono || clienteTelefono || null,
          clienteEmail: pedidoVinculado?.clienteEmail || clienteEmail || null,
          clienteDni: pedidoVinculado?.clienteDni || clienteDni || null,
          productos: productosEfectivos,
          estadoPago: yaPagado ? "pagado" : (metodoPago === "pagar_al_retirar" ? "cobrar_al_retirar" : "pendiente"),
          medioPago: medioPago || null,
          fechaEstimada,
          notas: notas || null,
        }),
      });
      if (res.ok) {
        const { retiro } = await res.json();
        router.push(`/retiros/${retiro.id}`);
      } else {
        const d = await res.json().catch(() => null);
        setErrorCreacion(d?.error ?? "No se pudo crear el retiro");
      }
    } finally {
      setCreando(false);
    }
  }

  function cerrarFormulario() {
    setShowFormManual(false);
    setPedidoVinculado(null);
  }

  async function eliminarRetiroLista(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm("¿Eliminar este retiro? Esta acción no se puede deshacer.")) return;
    setEliminandoId(id);
    try {
      const r = await fetch(`/api/retiros/${id}`, { method: "DELETE" });
      if (r.ok) {
        setRetiros(prev => prev.filter(x => x.id !== id));
        fetchCounts();
      } else {
        const d = await r.json().catch(() => null);
        alert(d?.error ?? "No se pudo eliminar el retiro");
      }
    } finally {
      setEliminandoId(null);
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
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Retiros Presenciales</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Pedidos que el cliente retira en el local — cargalos acá para que depósito sepa qué tener preparado.
              </p>
            </div>
            <button className="sf-btn" onClick={abrirCrear}>
              <i className="fas fa-plus" /> Crear retiro presencial
            </button>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <RetiroStatCards counts={counts} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
              <i className="fas fa-magnifying-glass" style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.8rem" }} />
              <input
                className="sf-input" style={{ paddingLeft: "2rem" }}
                placeholder="Buscar por código, pedido, nombre, teléfono o email..."
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <select className="sf-input" style={{ maxWidth: 190 }} value={filtroEstadoRetiro} onChange={e => setFiltroEstadoRetiro(e.target.value)}>
              <option value="">Todo estado de retiro</option>
              {Object.entries(ESTADO_RETIRO_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="sf-input" style={{ maxWidth: 190 }} value={filtroEstadoPago} onChange={e => setFiltroEstadoPago(e.target.value)}>
              <option value="">Todo estado de pago</option>
              {Object.entries(ESTADO_PAGO_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="sf-input" style={{ maxWidth: 170 }} value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)}>
              <option value="">Todo canal</option>
              <option value="tiendanube">Tienda Nube</option>
              <option value="mercadolibre">Mercado Libre</option>
            </select>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <button className={`sf-btn ${filtroFecha === "hoy" ? "" : "sf-btn-secondary"}`} style={{ padding: "0.4rem 0.7rem", fontSize: "0.8rem" }} onClick={() => setFiltroFecha(f => f === "hoy" ? "" : "hoy")}>Hoy</button>
              <button className={`sf-btn ${filtroFecha === "manana" ? "" : "sf-btn-secondary"}`} style={{ padding: "0.4rem 0.7rem", fontSize: "0.8rem" }} onClick={() => setFiltroFecha(f => f === "manana" ? "" : "manana")}>Mañana</button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
            </div>
          ) : retiros.length === 0 ? (
            <div className="sf-empty">
              <i className="fas fa-box-open sf-empty-icon" />
              <p style={{ fontWeight: 600, color: "var(--text-muted)" }}>No hay retiros para este filtro</p>
            </div>
          ) : (
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead>
                  <tr>
                    <th>Retiro</th>
                    <th>Cliente</th>
                    <th>Pedido</th>
                    <th>Productos</th>
                    <th>Fecha estimada</th>
                    <th>Pago</th>
                    <th>Estado</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ width: 1 }} />
                  </tr>
                </thead>
                <tbody>
                  {retiros.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "row-even" : "row-odd"} style={{ cursor: "pointer" }} onClick={() => router.push(`/retiros/${r.id}`)}>
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.codigo}</td>
                      <td>{r.cliente_nombre}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {r.numero_pedido ? <>#{r.numero_pedido}<br />{CANAL_LABELS[r.canal_pedido ?? ""] ?? ""}</> : "Manual"}
                      </td>
                      <td style={{ fontSize: "0.82rem", maxWidth: 220 }}>
                        {r.productos_json.map(p => `${p.nombre}${p.cantidad > 1 ? ` x${p.cantidad}` : ""}`).join(", ")}
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>{fmtDate(r.fecha_estimada)}</td>
                      <td>
                        <span className="sf-badge" style={{ background: (ESTADO_PAGO_COLORS[r.estado_pago] ?? "#94a3b8") + "22", color: ESTADO_PAGO_COLORS[r.estado_pago] ?? "#94a3b8", border: `1px solid ${ESTADO_PAGO_COLORS[r.estado_pago] ?? "#94a3b8"}44` }}>
                          {ESTADO_PAGO_LABELS[r.estado_pago] ?? r.estado_pago}
                        </span>
                      </td>
                      <td>
                        <span className="sf-badge" style={{ background: (ESTADO_RETIRO_COLORS[r.estado_retiro] ?? "#94a3b8") + "22", color: ESTADO_RETIRO_COLORS[r.estado_retiro] ?? "#94a3b8", border: `1px solid ${ESTADO_RETIRO_COLORS[r.estado_retiro] ?? "#94a3b8"}44` }}>
                          {ESTADO_RETIRO_LABELS[r.estado_retiro] ?? r.estado_retiro}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(Number(r.total))}</td>
                      <td style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button
                          className="sf-icon-btn danger" title="Eliminar retiro"
                          disabled={eliminandoId === r.id}
                          onClick={e => eliminarRetiroLista(e, r.id)}
                        >
                          {eliminandoId === r.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
                        </button>
                        <i className="fas fa-chevron-right" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }} />
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

      {/* ── Paso 1: ¿Tiene pedido? ────────────────────────────────────────── */}
      {showElegirOrigen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setShowElegirOrigen(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(440px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title"><i className="fas fa-box-open" style={{ color: "var(--primary-color)" }} /> Crear retiro presencial</h3>
              <button className="sf-close-btn" onClick={() => setShowElegirOrigen(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>¿El cliente ya tiene un pedido?</p>
              <button className="sf-btn" style={{ justifyContent: "flex-start" }} onClick={elegirVinculado}>
                <i className="fas fa-magnifying-glass" /> Sí, buscar pedido existente
              </button>
              <button className="sf-btn sf-btn-secondary" style={{ justifyContent: "flex-start" }} onClick={elegirManual}>
                <i className="fas fa-pen" /> No, cargar un pedido nuevo
              </button>
            </div>
          </div>
        </>
      )}

      {showOrderPicker && (
        <RetiroOrderPicker onSelect={onPedidoElegido} onClose={() => setShowOrderPicker(false)} />
      )}

      {/* ── Paso 2: formulario (vinculado o manual) ─────────────────────────── */}
      {showFormManual && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !creando && cerrarFormulario()} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(640px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-box-open" style={{ color: "var(--primary-color)" }} />
                {pedidoVinculado ? `Retiro — Pedido #${pedidoVinculado.numeroPedido}` : "Retiro manual"}
              </h3>
              <button className="sf-close-btn" onClick={() => !creando && cerrarFormulario()}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {pedidoVinculado?.metodoEntregaOriginal && (
                <div className="sf-alert sf-alert-warning">
                  <i className="fas fa-triangle-exclamation" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>Estado original del pedido: {pedidoVinculado.metodoEntregaOriginal}{pedidoVinculado.trackingOriginal ? ` · Tracking: ${pedidoVinculado.trackingOriginal}` : ""}. Revisá si ya tenía un envío en curso antes de convertirlo a retiro.</span>
                </div>
              )}

              {pedidoVinculado ? (
                <div className="sf-info-block">
                  <div className="sf-info-block-title">Datos importados del pedido</div>
                  <div className="sf-info-block-grid">
                    <div><strong>Cliente:</strong> {pedidoVinculado.clienteNombre || "—"}</div>
                    <div><strong>Teléfono:</strong> {pedidoVinculado.clienteTelefono || "—"}</div>
                    <div><strong>Email:</strong> {pedidoVinculado.clienteEmail || "—"}</div>
                    <div><strong>DNI:</strong> {pedidoVinculado.clienteDni || "—"}</div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <strong>Productos:</strong> {pedidoVinculado.pedidoProductos.length
                        ? pedidoVinculado.pedidoProductos.map(p => `${p.nombre}${p.cantidad > 1 ? ` x${p.cantidad}` : ""}`).join(", ")
                        : "—"}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <label className="sf-label">Nombre del cliente
                      <input className="sf-input" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Nombre y apellido" autoFocus />
                    </label>
                    <label className="sf-label">Teléfono
                      <input className="sf-input" value={clienteTelefono} onChange={e => setClienteTelefono(e.target.value)} placeholder="Opcional" />
                    </label>
                    <label className="sf-label">Email
                      <input className="sf-input" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="Opcional" />
                    </label>
                    <label className="sf-label">DNI
                      <input className="sf-input" value={clienteDni} onChange={e => setClienteDni(e.target.value)} placeholder="Opcional" />
                    </label>
                  </div>

                  <div>
                    <div className="sf-label" style={{ marginBottom: "0.4rem" }}>Productos</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {productos.map((p, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px 90px auto", gap: "0.4rem", alignItems: "center" }}>
                          <input className="sf-input" placeholder="SKU" value={p.sku} onChange={e => editarProductoRow(i, "sku", e.target.value)} />
                          <input className="sf-input" placeholder="Producto" value={p.nombre} onChange={e => editarProductoRow(i, "nombre", e.target.value)} />
                          <input className="sf-input" type="number" min="1" step="1" placeholder="Cant." value={p.cantidad} onChange={e => editarProductoRow(i, "cantidad", e.target.value)} />
                          <input className="sf-input" type="number" min="0" step="0.01" placeholder="Precio" value={p.precio} onChange={e => editarProductoRow(i, "precio", e.target.value)} />
                          <button className="sf-icon-btn danger" title="Quitar" onClick={() => quitarProductoRow(i)} disabled={productos.length === 1}>
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button className="sf-btn sf-btn-secondary" style={{ marginTop: "0.5rem", padding: "0.35rem 0.7rem", fontSize: "0.8rem" }} onClick={agregarProductoRow}>
                      <i className="fas fa-plus" /> Agregar producto
                    </button>
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", padding: "0.5rem 0", borderTop: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)" }}>
                <span style={{ color: "var(--text-muted)" }}>Total</span>
                <strong style={{ fontFamily: "monospace" }}>{fmtMoney(totalEfectivo)}</strong>
              </div>

              {yaPagado ? (
                <div className="sf-alert sf-alert-ok"><i className="fas fa-circle-check" /><span>Este pedido ya figura pagado — el retiro se crea como Pagado.</span></div>
              ) : (
                <div>
                  <div className="sf-label" style={{ marginBottom: "0.4rem" }}>¿Cuándo paga?</div>
                  <div style={{ display: "flex", gap: "1.25rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input type="radio" checked={metodoPago === "pagar_ahora"} onChange={() => setMetodoPago("pagar_ahora")} /> Pagar ahora
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input type="radio" checked={metodoPago === "pagar_al_retirar"} onChange={() => setMetodoPago("pagar_al_retirar")} /> Pagar al retirar
                    </label>
                  </div>
                </div>
              )}

              <label className="sf-label">¿Cómo va a pagar? (opcional)
                <select className="sf-input" value={medioPago} onChange={e => setMedioPago(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {MEDIOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>

              <div>
                <div className="sf-label" style={{ marginBottom: "0.4rem" }}>¿Cuándo estima retirar?</div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button className={`sf-btn ${fechaEstimada === hoyStr() ? "" : "sf-btn-secondary"}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.8rem" }} onClick={() => setFechaEstimada(hoyStr())}>Hoy</button>
                  <button className={`sf-btn ${fechaEstimada === mananaStr() ? "" : "sf-btn-secondary"}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.8rem" }} onClick={() => setFechaEstimada(mananaStr())}>Mañana</button>
                  <input className="sf-input" type="date" style={{ maxWidth: 160 }} value={fechaEstimada && fechaEstimada !== hoyStr() && fechaEstimada !== mananaStr() ? fechaEstimada : ""} onChange={e => setFechaEstimada(e.target.value || null)} />
                  <button className={`sf-btn ${fechaEstimada === null ? "" : "sf-btn-secondary"}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.8rem" }} onClick={() => setFechaEstimada(null)}>Sin fecha</button>
                </div>
              </div>

              <label className="sf-label">Notas
                <textarea className="sf-input" rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" style={{ resize: "vertical", fontFamily: "inherit" }} />
              </label>

              {errorCreacion && (
                <div className="sf-alert sf-alert-warning"><i className="fas fa-triangle-exclamation" /><span>{errorCreacion}</span></div>
              )}
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={cerrarFormulario} disabled={creando}>Cancelar</button>
              <button className="sf-btn" onClick={confirmarCrear} disabled={creando}>
                {creando ? <><i className="fas fa-spinner fa-spin" /> Creando...</> : <><i className="fas fa-check" /> Crear retiro</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
