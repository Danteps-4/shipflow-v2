interface SummaryCardsProps {
  totalFilas: number;
  ordenesUnicas: number;
  totalDomicilio: number;
  totalSucursal: number;
  totalErrores: number;
}

interface CardProps {
  label: string;
  value: number;
  icon: string;
  valueClass?: string;
}

function StatCard({ label, value, icon, valueClass = "" }: CardProps) {
  return (
    <div className="sf-stat-card">
      <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>
        <i className={icon} />
      </div>
      <div className={`sf-stat-value ${valueClass}`}>{value}</div>
      <div className="sf-stat-label">{label}</div>
    </div>
  );
}

export default function SummaryCards({
  totalFilas,
  ordenesUnicas,
  totalDomicilio,
  totalSucursal,
  totalErrores,
}: SummaryCardsProps) {
  return (
    <div className="sf-summary-grid">
      <StatCard label="Filas leídas"    value={totalFilas}      icon="fas fa-list"        />
      <StatCard label="Órdenes únicas"  value={ordenesUnicas}   icon="fas fa-cube"        />
      <StatCard label="A domicilio"     value={totalDomicilio}  icon="fas fa-house"       valueClass="success" />
      <StatCard label="A sucursal"      value={totalSucursal}   icon="fas fa-building"    valueClass="" />
      <StatCard
        label="Con errores"
        value={totalErrores}
        icon="fas fa-triangle-exclamation"
        valueClass={totalErrores > 0 ? "error" : ""}
      />
    </div>
  );
}
