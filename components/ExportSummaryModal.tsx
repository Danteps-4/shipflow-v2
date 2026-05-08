"use client";

import { useEffect } from "react";
import { ValidationError } from "@/types/orders";

interface StockAlert {
  sku: string;
  nombre: string;
  disponible: number;
  solicitado: number;
}

interface ExportSummaryModalProps {
  exportedDomicilio: number;
  exportedSucursal: number;
  omitidos: ValidationError[];
  stockInsuficiente?: StockAlert[];
  onClose: () => void;
}

export default function ExportSummaryModal({
  exportedDomicilio,
  exportedSucursal,
  omitidos,
  stockInsuficiente = [],
  onClose,
}: ExportSummaryModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalExported = exportedDomicilio + exportedSucursal;

  return (
    <>
      <div className="sf-modal-backdrop" onClick={onClose} />
      <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(580px, calc(100vw - 2rem))" }}>

        {/* Header */}
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">
            <i className="fas fa-file-excel" style={{ color: "var(--success-color)" }} />
            Excel generado
          </h3>
          <button className="sf-close-btn" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className="sf-modal-body">

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <StatBox
              value={totalExported}
              label="Pedidos exportados"
              color="var(--success-color)"
              icon="fas fa-circle-check"
            />
            <StatBox
              value={exportedDomicilio}
              label="A domicilio"
              color="var(--primary-color)"
              icon="fas fa-house"
            />
            <StatBox
              value={exportedSucursal}
              label="A sucursal"
              color="#a78bfa"
              icon="fas fa-building"
            />
          </div>

          {/* Omitidos */}
          {omitidos.length > 0 ? (
            <div>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.75rem",
                padding: "0.65rem 0.875rem",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "var(--radius)",
              }}>
                <i className="fas fa-triangle-exclamation" style={{ color: "var(--error-color)" }} />
                <span style={{ fontSize: "0.875rem", color: "var(--error-color)", fontWeight: 600 }}>
                  {omitidos.length} pedido{omitidos.length !== 1 ? "s" : ""} no incluido{omitidos.length !== 1 ? "s" : ""} por errores
                </span>
              </div>

              <div className="sf-table-wrap">
                <table className="sf-table">
                  <thead>
                    <tr>
                      <th>N° Orden</th>
                      <th>Tipo</th>
                      <th>Campos con problemas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {omitidos.map((err, i) => (
                      <tr key={i} className="row-error">
                        <td>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--error-color)" }}>
                            #{err.numeroOrden}
                          </span>
                        </td>
                        <td>
                          <span className={`sf-badge ${err.tipo === "domicilio" ? "sf-badge-home" : "sf-badge-store"}`}>
                            <i className={err.tipo === "domicilio" ? "fas fa-house" : "fas fa-building"} />
                            {err.tipo === "domicilio" ? "Domicilio" : "Sucursal"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                            {err.campos.map((c, j) => (
                              <span key={j} className="sf-badge sf-badge-error" style={{ fontSize: "0.68rem" }}>{c}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                <i className="fas fa-circle-info" style={{ marginRight: "0.35rem" }} />
                Corregí estos pedidos desde la pestaña <strong>Errores</strong> y volvé a exportar.
              </p>
            </div>
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.75rem 1rem",
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "var(--radius)",
              fontSize: "0.875rem",
              color: "var(--success-color)",
              fontWeight: 600,
            }}>
              <i className="fas fa-circle-check" />
              Todos los pedidos fueron incluidos correctamente.
            </div>
          )}
        </div>

        {/* Stock insuficiente */}
        {stockInsuficiente.length > 0 && (
          <div style={{
            padding: "0.75rem 1rem",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: "var(--radius)",
            marginTop: "0.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <i className="fas fa-triangle-exclamation" style={{ color: "#f59e0b" }} />
              <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#f59e0b" }}>
                Stock insuficiente en {stockInsuficiente.length} SKU{stockInsuficiente.length !== 1 ? "s" : ""}
              </span>
            </div>
            {stockInsuficiente.map(s => (
              <div key={s.sku} style={{ fontSize: "0.78rem", color: "var(--text-muted)", paddingLeft: "1.5rem", marginTop: "0.2rem" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--text-color)" }}>{s.sku}</span>
                {s.nombre ? ` — ${s.nombre}` : ""} &nbsp;·&nbsp; disponible: <strong>{s.disponible}</strong>, solicitado: <strong>{s.solicitado}</strong>
              </div>
            ))}
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
              El stock se descuentó igual. Reponelo desde <a href="/stock" style={{ color: "var(--primary-color)" }}>Stock de Productos</a>.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </>
  );
}

function StatBox({ value, label, color, icon }: { value: number; label: string; color: string; icon: string }) {
  return (
    <div style={{
      background: "rgba(15,23,42,0.5)",
      border: "1px solid var(--border-color)",
      borderRadius: "var(--radius)",
      padding: "1rem",
      textAlign: "center",
    }}>
      <i className={icon} style={{ color, fontSize: "1.1rem", marginBottom: "0.4rem", display: "block" }} />
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.3rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
    </div>
  );
}
