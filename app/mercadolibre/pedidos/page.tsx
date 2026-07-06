"use client";

import { useState, useEffect, useCallback } from "react";
import type { MlOrder } from "@/lib/mlClient";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

type FilterPreset = "all" | "paid" | "cancelled";
const PRESETS: Record<FilterPreset, { label: string; icon: string; status?: string }> = {
  all:       { label: "Todos",      icon: "fas fa-list" },
  paid:      { label: "Pagados",    icon: "fas fa-circle-check", status: "paid" },
  cancelled: { label: "Cancelados", icon: "fas fa-ban",          status: "cancelled" },
};
const PER_PAGE = 20;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; icon: string }> = {
    paid:               { cls: "sf-badge-ok",      label: "Pagado",            icon: "fas fa-circle-check" },
    confirmed:          { cls: "sf-badge-warning", label: "Confirmado",        icon: "fas fa-clock" },
    payment_required:   { cls: "sf-badge-warning", label: "Pago pendiente",    icon: "fas fa-clock" },
    payment_in_process: { cls: "sf-badge-warning", label: "Pago en proceso",   icon: "fas fa-spinner" },
    partially_paid:     { cls: "sf-badge-warning", label: "Pago parcial",      icon: "fas fa-clock" },
    cancelled:           { cls: "sf-badge-error",   label: "Cancelado",        icon: "fas fa-ban" },
    invalid:             { cls: "sf-badge-error",   label: "Inválido",         icon: "fas fa-triangle-exclamation" },
  };
  const { cls, label, icon } = map[status] ?? { cls: "sf-badge", label: status, icon: "" };
  return <span className={`sf-badge ${cls}`}><i className={icon} /> {label}</span>;
}

function productSummary(items: MlOrder["order_items"]): string {
  if (!items?.length) return "—";
  return items.map((oi) => {
    const label = oi.item.seller_sku ?? oi.item.title.substring(0, 20);
    return oi.quantity > 1 ? `${label} x${oi.quantity}` : label;
  }).join("  ·  ");
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtTotal(total?: number, currency?: string): string {
  if (total === undefined) return "—";
  return `${currency === "ARS" ? "$" : currency ?? ""} ${total.toLocaleString("es-AR")}`;
}

function buyerName(buyer?: MlOrder["buyer"]): string {
  if (!buyer) return "—";
  const name = [buyer.first_name, buyer.last_name].filter(Boolean).join(" ");
  return name || buyer.nickname || "—";
}

export default function MercadoLibrePedidosPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected]     = useState<boolean | null>(null);

  const [preset, setPreset] = useState<FilterPreset>("all");
  const [page, setPage]     = useState(1);

  const [orders, setOrders]   = useState<MlOrder[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const totalPages = Math.ceil(total / PER_PAGE);

  useEffect(() => {
    fetch("/api/mercadolibre/status")
      .then((r) => r.json())
      .then((d) => setConnected(!!d.connected))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => { setPage(1); }, [preset]);

  const fetchOrders = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    const cfg = PRESETS[preset];
    const params = new URLSearchParams({
      offset: String((page - 1) * PER_PAGE),
      limit:  String(PER_PAGE),
    });
    if (cfg.status) params.set("status", cfg.status);
    try {
      const res = await fetch(`/api/mercadolibre/orders?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setOrders(data.orders);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [connected, preset, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
      </header>

      <main className="sf-main">
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Pedidos de Mercado Libre</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Consulta en tiempo real de las ventas de tu cuenta de Mercado Libre. El stock se descuenta automáticamente al confirmarse el pago.
          </p>

          {connected === null && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.4rem" }} />
              Verificando conexión...
            </div>
          )}

          {connected === false && (
            <div>
              <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
                <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
                <span>No estás conectado a Mercado Libre.</span>
              </div>
              <a href="/mercadolibre" className="sf-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <i className="fas fa-plug" /> Ir a conectar la cuenta
              </a>
            </div>
          )}

          {connected === true && (
            <>
              <div className="sf-tabs" style={{ marginBottom: "1rem" }}>
                {(Object.entries(PRESETS) as [FilterPreset, typeof PRESETS[FilterPreset]][]).map(([key, cfg]) => (
                  <button key={key} className={`sf-tab ${preset === key ? "active" : ""}`} onClick={() => setPreset(key)}>
                    <i className={cfg.icon} /> {cfg.label}
                  </button>
                ))}
              </div>

              {error && (
                <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
                  <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {loading && (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem", display: "block", marginBottom: "0.75rem" }} />
                  Cargando pedidos…
                </div>
              )}

              {!loading && orders.length === 0 && !error && (
                <div className="sf-empty">
                  <i className="fas fa-box-open sf-empty-icon" />
                  <p style={{ fontWeight: 600, color: "var(--text-muted)" }}>No hay pedidos para este filtro</p>
                </div>
              )}

              {!loading && orders.length > 0 && (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Fecha</th>
                        <th>Comprador</th>
                        <th>Productos / SKU</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order, i) => (
                        <tr key={order.id} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                          <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary-color)", whiteSpace: "nowrap" }}>
                            #{order.id}
                          </td>
                          <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(order.date_created)}</td>
                          <td>{buyerName(order.buyer)}</td>
                          <td style={{ fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: 260 }} title={productSummary(order.order_items)}>
                            {productSummary(order.order_items)}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {fmtTotal(order.total_amount, order.currency_id)}
                          </td>
                          <td><StatusBadge status={order.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loading && totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Página <strong>{page}</strong> de <strong>{totalPages}</strong> · {total} pedidos
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="sf-btn sf-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                      <i className="fas fa-chevron-left" /> Anterior
                    </button>
                    <button className="sf-btn sf-btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ opacity: page >= totalPages ? 0.4 : 1 }}>
                      Siguiente <i className="fas fa-chevron-right" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>
    </div>
  );
}
