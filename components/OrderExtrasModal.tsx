"use client";

import { useState } from "react";

export interface PedidoExtra {
  id: number;
  numero_orden: string;
  sku: string;
  cantidad: number;
  nota: string;
  created_at: string;
}

interface OrderExtrasModalProps {
  numeroOrden: number;
  extras: PedidoExtra[];
  onClose: () => void;
  onChange: (extras: PedidoExtra[]) => void;
}

export default function OrderExtrasModal({ numeroOrden, extras, onClose, onChange }: OrderExtrasModalProps) {
  const [sku, setSku]           = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota]         = useState("");
  const [saving, setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleAdd() {
    const s = sku.trim();
    if (!s) return;
    setSaving(true);
    try {
      const res = await fetch("/api/pedidos/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroOrden, sku: s, cantidad, nota }),
      });
      if (res.ok) {
        const { extra } = await res.json();
        onChange([...extras, extra]);
        setSku("");
        setCantidad(1);
        setNota("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch("/api/pedidos/extras", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      onChange(extras.filter(e => e.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="sf-modal-backdrop" onClick={onClose} />
      <div className="sf-modal" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">
            <i className="fas fa-plus" style={{ color: "var(--primary-color)" }} />
            Agregados al pedido
            <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 400 }}>
              &nbsp;#{numeroOrden}
            </span>
          </h3>
          <button className="sf-close-btn" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="sf-modal-body">
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Estos productos se suman solos la próxima vez que se generen las etiquetas de este pedido.
          </p>

          {extras.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.25rem" }}>
              {extras.map(e => (
                <div key={e.id} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: "var(--radius)", padding: "0.45rem 0.6rem",
                }}>
                  <span style={{ fontWeight: 600, fontFamily: "monospace", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                    {e.sku}{e.cantidad > 1 ? ` ×${e.cantidad}` : ""}
                  </span>
                  {e.nota && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", flex: 1 }}>{e.nota}</span>
                  )}
                  <button
                    onClick={() => handleDelete(e.id)}
                    disabled={deletingId === e.id}
                    title="Sacar"
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0.2rem" }}
                  >
                    <i className="fas fa-trash" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="sf-form-grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div className="sf-form-field">
              <label className="sf-form-label">Producto / SKU</label>
              <input
                className="sf-form-input" value={sku} onChange={e => setSku(e.target.value)}
                placeholder="EXTENSOR" onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="sf-form-field">
              <label className="sf-form-label">Cantidad</label>
              <input
                className="sf-form-input" type="number" min={1} value={cantidad}
                onChange={e => setCantidad(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <div className="sf-form-field">
            <label className="sf-form-label">Nota (opcional)</label>
            <input
              className="sf-form-input" value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Ej: el cliente pidió cambiarlo por teléfono"
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
          </div>
        </div>

        <div className="sf-modal-footer">
          <button className="sf-btn sf-btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="sf-btn" onClick={handleAdd} disabled={saving || !sku.trim()}>
            <i className="fas fa-plus" /> Agregar
          </button>
        </div>
      </div>
    </>
  );
}
