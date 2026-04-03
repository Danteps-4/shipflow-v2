"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TnOrder, OrdersApiResponse } from "@/types/orders";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";

// ── Filter presets ───────────────────────────────────────────────
type FilterPreset = "all" | "paid" | "to_ship" | "shipped" | "delivered";
interface PresetConfig {
  label: string;
  icon: string;
  payment_status?: string;
  shipping_status?: string;
}
const PRESETS: Record<FilterPreset, PresetConfig> = {
  all:       { label: "Todos",      icon: "fas fa-list" },
  paid:      { label: "Pagados",    icon: "fas fa-circle-check",  payment_status: "paid" },
  to_ship:   { label: "Por enviar", icon: "fas fa-box",           payment_status: "paid", shipping_status: "unshipped" },
  shipped:   { label: "Enviados",   icon: "fas fa-truck",         shipping_status: "shipped" },
  delivered: { label: "Entregados", icon: "fas fa-circle-check",  shipping_status: "delivered" },
};
const PER_PAGE = 20;

// ── Badge helpers ────────────────────────────────────────────────
function PaymentBadge({ status }: { status: TnOrder["payment_status"] }) {
  const map = {
    paid:      { cls: "sf-badge-ok",      label: "Pagado",      icon: "fas fa-circle-check" },
    pending:   { cls: "sf-badge-warning", label: "Pendiente",   icon: "fas fa-clock" },
    voided:    { cls: "sf-badge-error",   label: "Anulado",     icon: "fas fa-ban" },
    refunded:  { cls: "sf-badge-error",   label: "Reembolsado", icon: "fas fa-rotate-left" },
    abandoned: { cls: "sf-badge-warning", label: "Abandonado",  icon: "fas fa-ghost" },
  } as const;
  const { cls, label, icon } = map[status] ?? { cls: "sf-badge", label: status, icon: "" };
  return <span className={`sf-badge ${cls}`}><i className={icon} /> {label}</span>;
}

function ShippingBadge({ status }: { status: TnOrder["shipping_status"] }) {
  const map = {
    unshipped: { cls: "sf-badge-warning", label: "Sin enviar",   icon: "fas fa-box-open" },
    unpacked:  { cls: "sf-badge-warning", label: "Sin preparar", icon: "fas fa-boxes-stacked" },
    packed:    { cls: "sf-badge-store",   label: "Empacado",     icon: "fas fa-box" },
    shipped:   { cls: "sf-badge-ok",      label: "Enviado",      icon: "fas fa-truck" },
    delivered: { cls: "sf-badge-ok",      label: "Entregado",    icon: "fas fa-circle-check" },
  } as const;
  const { cls, label, icon } = map[status] ?? { cls: "sf-badge", label: status, icon: "" };
  return <span className={`sf-badge ${cls}`}><i className={icon} /> {label}</span>;
}

// ── Helpers ──────────────────────────────────────────────────────
function productSummary(products: TnOrder["products"]): string {
  if (!products?.length) return "—";
  return products.map((p) => {
    const sku = p.sku ?? p.name.substring(0, 14);
    return p.quantity > 1 ? `${sku} x${p.quantity}` : sku;
  }).join("  ·  ");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtTotal(total: string, currency: string): string {
  return `${currency === "ARS" ? "$" : currency} ${Number(total).toLocaleString("es-AR")}`;
}

// ── Sidebar nav ──────────────────────────────────────────────────
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div className={`sf-sidebar ${open ? "open" : ""}`}>
        <div className="sf-sidebar-header">
          <h3>Menú</h3>
          <button className="sf-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <nav className="sf-nav">
          <a href="/"><i className="fas fa-house" /> Inicio</a>
          <a href="/orders" className="active"><i className="fas fa-receipt" /> Pedidos</a>
          <a href="/procesar"><i className="fas fa-file-excel" /> Procesar Pedidos</a>
          <a href="/etiquetas"><i className="fas fa-tags" /> Agregar SKU a Etiquetas</a>
          <a href="/tracking"><i className="fas fa-truck" /> Subir Tracking</a>
        </nav>
      </div>
      <div className={`sf-overlay ${open ? "open" : ""}`} onClick={onClose} />
    </>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function OrdersPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected]     = useState<boolean | null>(null);
  const [storeId, setStoreId]         = useState<number | null>(null);

  const [preset, setPreset]           = useState<FilterPreset>("to_ship");
  const [search, setSearch]           = useState("");
  const [debouncedSearch, setDebounced] = useState("");
  const [page, setPage]               = useState(1);

  const [orders, setOrders]     = useState<TnOrder[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const router = useRouter();
  const totalPages = Math.ceil(total / PER_PAGE);

  // Auth check
  useEffect(() => {
    fetch("/api/auth/status").then(r => r.json()).then(d => {
      setConnected(d.connected);
      if (d.connected) setStoreId(d.store_id);
    }).catch(() => setConnected(false));
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter/search change
  useEffect(() => { setPage(1); }, [preset, debouncedSearch]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    const cfg = PRESETS[preset];
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (cfg.payment_status)  params.set("payment_status",  cfg.payment_status);
    if (cfg.shipping_status) params.set("shipping_status", cfg.shipping_status);
    if (debouncedSearch)     params.set("q", debouncedSearch);
    try {
      const res = await fetch(`/api/orders?${params}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `Error ${res.status}`);
      const data: OrdersApiResponse = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [connected, preset, page, debouncedSearch]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  function toggleAll() {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleProcesar() {
    const toProcess = orders.filter((o) => selected.has(o.id));
    if (!toProcess.length) return;
    sessionStorage.setItem("tn_pending_orders", JSON.stringify(toProcess));
    router.push("/procesar");
  }

  async function handleDisconnect() {
    await fetch("/api/auth/logout", { method: "POST" });
    setConnected(false); setStoreId(null); setOrders([]);
  }

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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Pedidos</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Consultá los pedidos de tu tienda en tiempo real.
          </p>

          {/* Auth loading */}
          {connected === null && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.4rem" }} />
              Verificando conexión...
            </div>
          )}

          {/* Not connected */}
          {connected === false && (
            <div>
              <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
                <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
                <span>No estás conectado a Tienda Nube. Autorizá el acceso para ver los pedidos.</span>
              </div>
              <a href="/api/auth/login" className="sf-btn"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <i className="fas fa-link" /> Conectar con Tienda Nube
              </a>
            </div>
          )}

          {/* Connected */}
          {connected === true && (
            <>
              {/* Connection bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                <div className="sf-alert sf-alert-ok" style={{ flex: 1, marginBottom: 0 }}>
                  <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
                  <span>Conectado · Store ID: <strong>{storeId}</strong></span>
                </div>
                <button onClick={handleDisconnect} style={{
                  background: "none", border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius)", padding: "0.5rem 0.85rem",
                  color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", whiteSpace: "nowrap",
                }}>
                  <i className="fas fa-unlink" style={{ marginRight: "0.35rem" }} /> Desconectar
                </button>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <div className="sf-tabs" style={{ flex: 1, minWidth: 280, borderBottom: "none", marginBottom: 0 }}>
                  {(Object.entries(PRESETS) as [FilterPreset, PresetConfig][]).map(([key, cfg]) => (
                    <button key={key} className={`sf-tab ${preset === key ? "active" : ""}`}
                      onClick={() => setPreset(key)}>
                      <i className={cfg.icon} /> {cfg.label}
                    </button>
                  ))}
                </div>
                <div style={{ position: "relative" }}>
                  <i className="fas fa-magnifying-glass" style={{
                    position: "absolute", left: "0.65rem", top: "50%",
                    transform: "translateY(-50%)", color: "var(--text-muted)",
                    fontSize: "0.8rem", pointerEvents: "none",
                  }} />
                  <input type="text" className="sf-form-input"
                    placeholder="Buscar N°, nombre, email…"
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: "2rem", width: 240 }}
                  />
                </div>
              </div>
              <div style={{ borderBottom: "1px solid var(--border-color)", margin: "0 0 1rem" }} />

              {/* Selection action bar */}
              {selected.size > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "1rem",
                  background: "var(--primary-color)", color: "#fff",
                  borderRadius: "var(--radius)", padding: "0.6rem 1rem",
                  marginBottom: "1rem", flexWrap: "wrap",
                }}>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: "0.88rem" }}>
                    <i className="fas fa-check-square" style={{ marginRight: "0.4rem" }} />
                    {selected.size} pedido{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
                  </span>
                  <button onClick={() => setSelected(new Set())} style={{
                    background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "var(--radius)",
                    color: "#fff", padding: "0.35rem 0.75rem", cursor: "pointer", fontSize: "0.8rem",
                  }}>
                    <i className="fas fa-times" style={{ marginRight: "0.3rem" }} /> Limpiar
                  </button>
                  <button onClick={handleProcesar} style={{
                    background: "#fff", border: "none", borderRadius: "var(--radius)",
                    color: "var(--primary-color)", fontWeight: 700,
                    padding: "0.35rem 0.9rem", cursor: "pointer", fontSize: "0.85rem",
                  }}>
                    <i className="fas fa-file-excel" style={{ marginRight: "0.4rem" }} /> Procesar pedidos
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
                  <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem", display: "block", marginBottom: "0.75rem" }} />
                  Cargando pedidos…
                </div>
              )}

              {/* Empty */}
              {!loading && orders.length === 0 && !error && (
                <div className="sf-empty">
                  <i className="fas fa-box-open sf-empty-icon" />
                  <p style={{ fontWeight: 600, color: "var(--text-muted)" }}>No hay pedidos para este filtro</p>
                </div>
              )}

              {/* Table */}
              {!loading && orders.length > 0 && (
                <div className="sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            checked={orders.length > 0 && selected.size === orders.length}
                            onChange={toggleAll}
                          />
                        </th>
                        <th>N°</th>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Productos / SKU</th>
                        <th>Destino</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                        <th>Pago</th>
                        <th>Envío</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order, i) => (
                        <tr
                          key={order.id}
                          className={i % 2 === 0 ? "row-even" : "row-odd"}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleOne(order.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(order.id)}
                              onChange={() => toggleOne(order.id)}
                            />
                          </td>
                          <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary-color)", whiteSpace: "nowrap" }}>
                            #{order.number}
                          </td>
                          <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            {fmtDate(order.created_at)}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{order.contact_name}</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{order.contact_email}</div>
                          </td>
                          <td style={{ fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: 200 }}
                            title={productSummary(order.products)}>
                            {productSummary(order.products)}
                          </td>
                          <td style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                            {order.shipping_address
                              ? <><span style={{ fontWeight: 500 }}>{order.shipping_address.city}</span>
                                  <span style={{ color: "var(--text-muted)" }}>, {typeof order.shipping_address.province === "string" ? order.shipping_address.province : order.shipping_address.province?.name}</span></>
                              : <span style={{ color: "var(--text-muted)" }}>—</span>
                            }
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {fmtTotal(order.total, order.currency)}
                          </td>
                          <td><PaymentBadge status={order.payment_status} /></td>
                          <td><ShippingBadge status={order.shipping_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!loading && totalPages > 1 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginTop: "1.25rem", flexWrap: "wrap", gap: "0.75rem",
                }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Página <strong>{page}</strong> de <strong>{totalPages}</strong> · {total} pedidos
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="sf-btn sf-btn-secondary"
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                      style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                      <i className="fas fa-chevron-left" /> Anterior
                    </button>
                    <button className="sf-btn sf-btn-secondary"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      style={{ opacity: page >= totalPages ? 0.4 : 1 }}>
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
