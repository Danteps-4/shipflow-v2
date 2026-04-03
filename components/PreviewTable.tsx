"use client";

import { AndreaniDomicilio, AndreaniSucursal, ValidationError, GroupedOrder } from "@/types/orders";

type RowType = AndreaniDomicilio | AndreaniSucursal;

interface PreviewTableProps {
  data: RowType[];
  errores: ValidationError[];
  tipo: "domicilio" | "sucursal";
  groupedOrders: GroupedOrder[];
  onEdit?: (order: GroupedOrder, error: ValidationError) => void;
}

export default function PreviewTable({ data, errores, tipo, groupedOrders, onEdit }: PreviewTableProps) {
  if (data.length === 0) {
    return (
      <div className="sf-empty">
        <i className="fas fa-inbox sf-empty-icon" />
        <p style={{ fontWeight: 600, color: "var(--text-muted)" }}>No hay pedidos de este tipo</p>
      </div>
    );
  }

  const errorSet = new Set(errores.filter((e) => e.tipo === tipo).map((e) => e.numeroOrden));
  const groupedMap = new Map(groupedOrders.map((g) => [g.numeroOrden, g]));

  return (
    <div className="sf-table-wrap">
      <table className="sf-table">
        <thead>
          <tr>
            <th className="sticky-col">Estado</th>
            <th>Orden</th>
            <th>Cliente</th>
            <th>Dirección</th>
            <th>Ciudad</th>
            <th>{tipo === "domicilio" ? "Provincia / Localidad / CP" : "Sucursal"}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const numeroInterno = (row as AndreaniDomicilio)["Numero Interno"];
            const hasError = errorSet.has(numeroInterno);
            const rowClass = hasError ? "row-error" : i % 2 === 0 ? "row-even" : "row-odd";
            const grouped = groupedMap.get(numeroInterno);
            const d = row as AndreaniDomicilio;
            const s = row as AndreaniSucursal;

            const cliente = [d["Nombre"], d["Apellido"]].filter(Boolean).join(" ");
            const direccionLinea = tipo === "domicilio"
              ? [d["Calle"], d["Número"]].filter(Boolean).join(" ")
              : [grouped?.direccion, grouped?.numeroDireccion].filter(Boolean).join(" ");

            // Subtexto: datos originales del cliente (localidad, provincia, CP)
            const rawSubtexto = tipo === "domicilio"
              ? [grouped?.rawLocalidad, grouped?.rawProvincia, grouped?.rawCodigoPostal]
                  .filter(Boolean).join(", ")
              : "";

            // Ciudad: columna Ciudad del CSV
            const ciudadRaw = grouped?.ciudad ?? "";

            // Selección final
            const seleccion = tipo === "domicilio"
              ? d["Provincia / Localidad / CP"]
              : s["Sucursal"];

            // Validation error for this row (may be undefined if no error)
            const rowError = errores.find((e) => e.numeroOrden === numeroInterno && e.tipo === tipo);

            function handleEdit() {
              if (!grouped || !onEdit) return;
              const error: ValidationError = rowError ?? {
                numeroOrden: numeroInterno,
                campos: [],
                tipo,
              };
              onEdit(grouped, error);
            }

            return (
              <tr key={i} className={rowClass}>
                {/* Estado + editar */}
                <td className="sticky-col">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "nowrap" }}>
                    {hasError ? (
                      <span className="sf-badge sf-badge-error">
                        <i className="fas fa-circle-exclamation" /> Error
                      </span>
                    ) : (
                      <span className="sf-badge sf-badge-ok">
                        <i className="fas fa-circle-check" /> OK
                      </span>
                    )}
                    {onEdit && (
                      <button
                        onClick={handleEdit}
                        title="Editar pedido"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: "2px 4px",
                          borderRadius: "4px",
                          lineHeight: 1,
                          fontSize: "0.8rem",
                          flexShrink: 0,
                          transition: "color 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-color)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                      >
                        <i className="fas fa-pen" />
                      </button>
                    )}
                  </div>
                </td>

                {/* Orden */}
                <td style={{ fontFamily: "monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {numeroInterno}
                </td>

                {/* Cliente */}
                <td style={{ whiteSpace: "nowrap" }}>{cliente || "—"}</td>

                {/* Dirección */}
                <td>
                  <div style={{ fontWeight: 500 }}>{direccionLinea || "—"}</div>
                  {rawSubtexto && (
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                      {rawSubtexto}
                    </div>
                  )}
                </td>

                {/* Ciudad */}
                <td style={{ fontSize: "0.82rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {ciudadRaw || "—"}
                </td>

                {/* Selección */}
                <td className="col-seleccion">
                  {seleccion ? (
                    <span style={{
                      display: "inline-flex",
                      alignItems: "flex-start",
                      gap: "0.3rem",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--success-color)",
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                    }}>
                      <i className="fas fa-star" style={{ fontSize: "0.65rem", marginTop: "3px", flexShrink: 0 }} />
                      {seleccion}
                    </span>
                  ) : (
                    <span style={{ color: "var(--error-color)", fontSize: "0.78rem" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
