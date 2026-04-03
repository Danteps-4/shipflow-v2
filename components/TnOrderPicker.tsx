"use client";

import { useState, useEffect, useCallback } from "react";
import type { TnOrder, OrdersApiResponse, GroupedOrder } from "@/types/orders";
import { convertTnOrders } from "@/lib/convertTnOrders";

interface Props {
  onImport: (orders: GroupedOrder[]) => void;
  onClose: () => void;
}

const PER_PAGE = 50;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function ShippingLabel({ opt }: { opt: TnOrder["shipping_option"] }) {
  const raw = typeof opt === "string" ? opt : opt?.name ?? "—";
  return <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{raw || "—"}</span>;
}

export default function TnOrderPicker({ onImport, onClose }: Props) {
  const [orders, setOrders]     = useState<TnOrder[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch]     = useState("");
  const [debouncedSearch, setDebounced] = useState("");

  const totalPages = Math.ceil(total / PER_PAGE);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(PER_PAGE),
        payment_status: "paid",
        shipping_status: "unshipped",
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`/api/orders?${params}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `Error ${res.status}`);
      const data: OrdersApiResponse = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

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

  function handleImport() {
    const toImport = orders.filter((o) => selected.has(o.id));
    if (!toImport.length) return;
    onImport(convertTnOrders(toImport));
  }

  const allChecked = orders.length > 0 && selected.size === orders.length;

  return (
    <div className="sf-modal-overlay" onClick={onClose}>
      <div
        className="sf-modal"
        style={{ maxWidth: 760, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
              <i className="fas fa-store" style={{ marginRight: "0.5rem", color: "var(--primary-color)" }} />
              Importar desde Tienda Nube
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.2rem 0 0" }}>
              Pedidos pagados · sin enviar
            </p>
          </div>
          <button className="sf-close-btn" onClick={onClose} style={{ flexShrink: 0 }}>
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "1rem" }}>
          <i className="fas fa-magnifying-glass" style={{
            position: "absolute", left: "0.65rem", top: "50%",
            transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.8rem", pointerEvents: "none",
          }} />
          <input
            type="text"
            className="sf-form-input"
            placeholder="Buscar N°, nombre, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2rem", width: "100%" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
            <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted)" }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.3rem", display: "block", marginBottom: "0.5rem" }} />
            Cargando pedidos…
          </div>
        )}

        {/* Table */}
        {!loading && orders.length > 0 && (
          <div className="sf-table-wrap" style={{ flex: 1, overflowY: "auto" }}>
            <table className="sf-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th>N°</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Destino</th>
                  <th>Envío</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, i) => {
                  const addr = order.shipping_address;
                  const destino = addr
                    ? `${addr.city}, ${typeof addr.province === "string" ? addr.province : addr.province?.name ?? ""}`
                    : "—";
                  return (
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
                      <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                        {fmtDate(order.created_at)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{order.contact_name}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{order.contact_email}</div>
                      </td>
                      <td style={{ fontSize: "0.78rem" }}>{destino}</td>
                      <td><ShippingLabel opt={order.shipping_option} /></td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                        ${Number(order.total).toLocaleString("es-AR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && orders.length === 0 && !error && (
          <div className="sf-empty" style={{ flex: 1 }}>
            <i className="fas fa-box-open sf-empty-icon" />
            <p style={{ color: "var(--text-muted)" }}>No hay pedidos pagados sin enviar</p>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Página <strong>{page}</strong> de <strong>{totalPages}</strong> · {total} pedidos
            </span>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button className="sf-btn sf-btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                <i className="fas fa-chevron-left" />
              </button>
              <button className="sf-btn sf-btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ opacity: page >= totalPages ? 0.4 : 1 }}>
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)", gap: "1rem" }}>
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            {selected.size > 0
              ? <><strong>{selected.size}</strong> pedido{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}</>
              : "Seleccioná los pedidos a importar"
            }
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="sf-btn sf-btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="sf-btn" onClick={handleImport} disabled={selected.size === 0} style={{ opacity: selected.size === 0 ? 0.5 : 1 }}>
              <i className="fas fa-file-import" /> Importar {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
