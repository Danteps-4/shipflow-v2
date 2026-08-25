"use client";

import { useState, useEffect, useRef } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
// Adaptado de components/TicketOrderPicker.tsx: mismas funciones de
// normalización TN/ML, pegando a /api/retiros/orders (gateado por el módulo
// "retiros", no "tickets"), y sumando lo que este flujo necesita además:
// si el pedido ya está pagado (define el estado de pago inicial del retiro)
// y si ya tenía un envío despachado (para avisar antes de convertirlo a
// retiro presencial, sin tocar nada del pedido automáticamente).

interface TnShippingAddress {
  address?: string;
  number?: string;
  floor?: string;
  locality?: string;
  city?: string;
  province?: string | { name?: string };
  zipcode?: string;
  phone?: string;
}

interface TnOrderResumen {
  id: number;
  number: number;
  created_at: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  contact_identification?: string | null;
  status: string;
  payment_status: string;
  shipping_status: string;
  total: string;
  currency: string;
  products: { name: string; sku: string | null; quantity: number; price?: string }[];
  shipping_address: TnShippingAddress | null;
  shipping_option?: string | { name?: string } | null;
  shipping_carrier_name?: string | null;
  shipping_tracking_number?: string | null;
  fulfillments?: { tracking_number?: string }[];
}

interface MlOrderResumen {
  id: number;
  status: string;
  date_created?: string;
  total_amount?: number;
  currency_id?: string;
  buyer?: { nickname?: string; first_name?: string; last_name?: string };
  order_items: { quantity: number; unit_price?: number; item: { id: string; title: string; seller_sku?: string | null } }[];
}

export interface ProductoPedidoRetiro {
  sku: string | null;
  nombre: string;
  cantidad: number;
  precio: number | null;
}

export interface PedidoRetiroSeleccionado {
  canalPedido: "tiendanube" | "mercadolibre";
  numeroPedido: string;
  pedidoIdInterno: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string;
  clienteDni: string;
  pedidoProductos: ProductoPedidoRetiro[];
  pagado: boolean;
  metodoEntregaOriginal: string;
  trackingOriginal: string;
}

// ─── Helpers de normalización ─────────────────────────────────────────────────

function normalizeTnOrder(o: TnOrderResumen): PedidoRetiroSeleccionado {
  const tracking = o.shipping_tracking_number || o.fulfillments?.[0]?.tracking_number || "";
  return {
    canalPedido: "tiendanube",
    numeroPedido: String(o.number),
    pedidoIdInterno: String(o.id),
    clienteNombre: o.contact_name || "",
    clienteTelefono: o.contact_phone || o.shipping_address?.phone || "",
    clienteEmail: o.contact_email || "",
    clienteDni: o.contact_identification || "",
    pedidoProductos: (o.products ?? []).map(p => ({
      sku: p.sku, nombre: p.name, cantidad: p.quantity, precio: p.price ? Number(p.price) : null,
    })),
    pagado: o.payment_status === "paid",
    metodoEntregaOriginal: `${o.status} · pago: ${o.payment_status} · envío: ${o.shipping_status}`,
    trackingOriginal: tracking,
  };
}

function normalizeMlOrder(o: MlOrderResumen): PedidoRetiroSeleccionado {
  const nombre = o.buyer?.nickname || [o.buyer?.first_name, o.buyer?.last_name].filter(Boolean).join(" ") || "Comprador Mercado Libre";
  return {
    canalPedido: "mercadolibre",
    numeroPedido: String(o.id),
    pedidoIdInterno: String(o.id),
    clienteNombre: nombre,
    clienteTelefono: "",
    clienteEmail: "",
    clienteDni: "",
    pedidoProductos: (o.order_items ?? []).map(oi => ({
      sku: oi.item.seller_sku ?? null, nombre: oi.item.title, cantidad: oi.quantity, precio: oi.unit_price ?? null,
    })),
    pagado: o.status === "paid",
    metodoEntregaOriginal: o.status,
    trackingOriginal: "",
  };
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Componente ────────────────────────────────────────────────────────────────

export default function RetiroOrderPicker({
  onSelect, onClose,
}: {
  onSelect: (pedido: PedidoRetiroSeleccionado) => void;
  onClose: () => void;
}) {
  const [canal, setCanal] = useState<"tiendanube" | "mercadolibre">("tiendanube");

  const [busqueda, setBusqueda] = useState("");
  const [tnResultados, setTnResultados] = useState<TnOrderResumen[]>([]);
  const [buscandoTn, setBuscandoTn] = useState(false);
  const [tnError, setTnError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mlResultados, setMlResultados] = useState<MlOrderResumen[]>([]);
  const [mlOffset, setMlOffset] = useState(0);
  const [mlTotal, setMlTotal] = useState(0);
  const [cargandoMl, setCargandoMl] = useState(false);
  const [mlError, setMlError] = useState<string | null>(null);
  const ML_LIMIT = 10;

  function onBuscarTn(value: string) {
    setBusqueda(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setTnResultados([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscandoTn(true);
      setTnError(null);
      try {
        const res = await fetch(`/api/retiros/orders?canal=tiendanube&q=${encodeURIComponent(value)}&per_page=8`);
        if (res.ok) {
          setTnResultados((await res.json()).orders ?? []);
        } else {
          setTnError((await res.json().catch(() => null))?.error ?? "Error al buscar pedidos");
        }
      } catch {
        setTnError("Error al buscar pedidos");
      } finally {
        setBuscandoTn(false);
      }
    }, 400);
  }

  async function fetchMl(offset: number) {
    setCargandoMl(true);
    setMlError(null);
    try {
      const res = await fetch(`/api/retiros/orders?canal=mercadolibre&offset=${offset}&limit=${ML_LIMIT}`);
      if (res.ok) {
        const d = await res.json();
        setMlResultados(d.orders ?? []);
        setMlTotal(d.total ?? 0);
      } else {
        setMlError((await res.json().catch(() => null))?.error ?? "Error al cargar pedidos de Mercado Libre");
      }
    } catch {
      setMlError("Error al cargar pedidos de Mercado Libre");
    } finally {
      setCargandoMl(false);
    }
  }

  useEffect(() => {
    if (canal === "mercadolibre") fetchMl(mlOffset);
  }, [canal, mlOffset]);

  return (
    <>
      <div className="sf-modal-backdrop" onClick={onClose} />
      <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(640px, calc(100vw - 2rem))" }}>
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">
            <i className="fas fa-magnifying-glass" style={{ color: "var(--primary-color)" }} />
            Buscar pedido
          </h3>
          <button className="sf-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="sf-tabs" style={{ marginBottom: 0 }}>
            <button className={`sf-tab ${canal === "tiendanube" ? "active" : ""}`} onClick={() => setCanal("tiendanube")}>
              <i className="fas fa-store" /> Tienda Nube
            </button>
            <button className={`sf-tab ${canal === "mercadolibre" ? "active" : ""}`} onClick={() => setCanal("mercadolibre")}>
              <i className="fas fa-bag-shopping" /> Mercado Libre
            </button>
          </div>

          {canal === "tiendanube" ? (
            <>
              <input
                className="sf-input"
                value={busqueda}
                onChange={e => onBuscarTn(e.target.value)}
                placeholder="Buscar por número de pedido o nombre del cliente..."
                autoFocus
              />
              {buscandoTn && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" /> Buscando...
                </div>
              )}
              {tnError && <div className="sf-alert sf-alert-warning"><i className="fas fa-triangle-exclamation" /><span>{tnError}</span></div>}
              {!buscandoTn && busqueda.trim().length >= 2 && tnResultados.length === 0 && !tnError && (
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Sin resultados.</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: 340, overflowY: "auto" }}>
                {tnResultados.map(o => (
                  <button
                    key={o.id}
                    onClick={() => onSelect(normalizeTnOrder(o))}
                    style={{
                      textAlign: "left", background: "rgba(15,23,42,0.4)", border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius)", padding: "0.65rem 0.85rem", cursor: "pointer", color: "var(--text-color)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                      <strong style={{ fontFamily: "monospace" }}>#{o.number}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{fmtDate(o.created_at)}</span>
                    </div>
                    <div style={{ fontSize: "0.85rem" }}>{o.contact_name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{o.contact_email}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                <i className="fas fa-circle-info" style={{ marginRight: "0.3rem" }} />
                Mercado Libre no tiene búsqueda por texto — navegá la lista de pedidos recientes.
              </p>
              {cargandoMl && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  <i className="fas fa-spinner fa-spin" /> Cargando...
                </div>
              )}
              {mlError && <div className="sf-alert sf-alert-warning"><i className="fas fa-triangle-exclamation" /><span>{mlError}</span></div>}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: 340, overflowY: "auto" }}>
                {mlResultados.map(o => (
                  <button
                    key={o.id}
                    onClick={() => onSelect(normalizeMlOrder(o))}
                    style={{
                      textAlign: "left", background: "rgba(15,23,42,0.4)", border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius)", padding: "0.65rem 0.85rem", cursor: "pointer", color: "var(--text-color)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                      <strong style={{ fontFamily: "monospace" }}>#{o.id}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{fmtDate(o.date_created ?? "")}</span>
                    </div>
                    <div style={{ fontSize: "0.85rem" }}>{o.buyer?.nickname || [o.buyer?.first_name, o.buyer?.last_name].filter(Boolean).join(" ") || "—"}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{o.status}</div>
                  </button>
                ))}
              </div>
              {mlTotal > ML_LIMIT && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button className="sf-btn sf-btn-secondary" disabled={mlOffset === 0} onClick={() => setMlOffset(o => Math.max(0, o - ML_LIMIT))}>
                    <i className="fas fa-chevron-left" /> Anterior
                  </button>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{mlOffset + 1}–{Math.min(mlOffset + ML_LIMIT, mlTotal)} de {mlTotal}</span>
                  <button className="sf-btn sf-btn-secondary" disabled={mlOffset + ML_LIMIT >= mlTotal} onClick={() => setMlOffset(o => o + ML_LIMIT)}>
                    Siguiente <i className="fas fa-chevron-right" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sf-modal-footer">
          <button className="sf-btn sf-btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </>
  );
}
