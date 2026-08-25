"use client";

import { useState, useRef } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
// Adaptado de components/TicketOrderPicker.tsx: misma normalización de un
// pedido de Tienda Nube, pegando a /api/retiros/orders (gateado por el
// módulo "retiros", no "tickets"). Solo Tienda Nube — a diferencia de
// Tickets, acá no hace falta buscar en Mercado Libre.

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

export interface ProductoPedidoRetiro {
  sku: string | null;
  nombre: string;
  cantidad: number;
  precio: number | null;
}

export interface PedidoRetiroSeleccionado {
  canalPedido: "tiendanube";
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

// ─── Helper de normalización ───────────────────────────────────────────────────

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
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<TnOrderResumen[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onBuscar(value: string) {
    setBusqueda(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResultados([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      setError(null);
      try {
        const res = await fetch(`/api/retiros/orders?q=${encodeURIComponent(value)}&per_page=8`);
        if (res.ok) {
          setResultados((await res.json()).orders ?? []);
        } else {
          setError((await res.json().catch(() => null))?.error ?? "Error al buscar pedidos");
        }
      } catch {
        setError("Error al buscar pedidos");
      } finally {
        setBuscando(false);
      }
    }, 400);
  }

  return (
    <>
      <div className="sf-modal-backdrop" onClick={onClose} />
      <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(560px, calc(100vw - 2rem))" }}>
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">
            <i className="fas fa-magnifying-glass" style={{ color: "var(--primary-color)" }} />
            Buscar pedido de Tienda Nube
          </h3>
          <button className="sf-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input
            className="sf-input"
            value={busqueda}
            onChange={e => onBuscar(e.target.value)}
            placeholder="Buscar por número de pedido o nombre del cliente..."
            autoFocus
          />
          {buscando && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" /> Buscando...
            </div>
          )}
          {error && <div className="sf-alert sf-alert-warning"><i className="fas fa-triangle-exclamation" /><span>{error}</span></div>}
          {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && !error && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Sin resultados.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: 340, overflowY: "auto" }}>
            {resultados.map(o => (
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
        </div>

        <div className="sf-modal-footer">
          <button className="sf-btn sf-btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </>
  );
}
