import { ValidationError, GroupedOrder } from "@/types/orders";

interface ErrorTableProps {
  errores: ValidationError[];
  groupedOrders: GroupedOrder[];
  onEdit: (order: GroupedOrder, error: ValidationError) => void;
}

export default function ErrorTable({ errores, groupedOrders, onEdit }: ErrorTableProps) {
  if (errores.length === 0) {
    return (
      <div className="sf-empty">
        <i className="fas fa-circle-check sf-empty-icon" style={{ color: "var(--success-color)", opacity: 1 }} />
        <p style={{ fontWeight: 600, color: "var(--text-color)", marginBottom: "0.25rem" }}>
          Sin errores de validación
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Todos los pedidos están completos y listos para exportar.
        </p>
      </div>
    );
  }

  const groupedMap = new Map(groupedOrders.map((g) => [g.numeroOrden, g]));

  return (
    <div className="sf-table-wrap">
      <table className="sf-table">
        <thead>
          <tr>
            <th>N° Orden</th>
            <th>Tipo</th>
            <th>Campos con problemas</th>
            <th style={{ width: "1px" }} />
          </tr>
        </thead>
        <tbody>
          {errores.map((err, i) => {
            const grouped = groupedMap.get(err.numeroOrden);
            return (
              <tr key={i} className={i % 2 === 0 ? "row-even" : "row-odd"}>
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
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {err.campos.map((campo, j) => (
                      <span key={j} className="sf-badge sf-badge-error">{campo}</span>
                    ))}
                  </div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {grouped && (
                    <button
                      className="sf-btn-edit"
                      onClick={() => onEdit(grouped, err)}
                      title="Editar pedido"
                    >
                      <i className="fas fa-pen-to-square" />
                      Editar
                    </button>
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
