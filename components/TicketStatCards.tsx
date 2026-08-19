interface TicketCounts {
  totalAbiertos: number;
  pendientesSupervision: number;
  enGestion: number;
  esperandoCliente: number;
  esperandoDevolucion: number;
  urgentes: number;
  slaVencidos: number;
}

function StatCard({ label, value, icon, valueClass = "" }: { label: string; value: number; icon: string; valueClass?: string }) {
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

export default function TicketStatCards({ counts }: { counts: TicketCounts | null }) {
  const c = counts ?? {
    totalAbiertos: 0, pendientesSupervision: 0, enGestion: 0,
    esperandoCliente: 0, esperandoDevolucion: 0, urgentes: 0, slaVencidos: 0,
  };
  return (
    <div className="sf-summary-grid">
      <StatCard label="Total abiertos" value={c.totalAbiertos} icon="fas fa-ticket" />
      <StatCard label="Pendientes de supervisión" value={c.pendientesSupervision} icon="fas fa-user-shield" />
      <StatCard label="En gestión" value={c.enGestion} icon="fas fa-gears" />
      <StatCard label="Esperando cliente" value={c.esperandoCliente} icon="fas fa-clock" />
      <StatCard label="Esperando devolución" value={c.esperandoDevolucion} icon="fas fa-truck-ramp-box" />
      <StatCard label="Urgentes" value={c.urgentes} icon="fas fa-bolt" valueClass={c.urgentes > 0 ? "error" : ""} />
      <StatCard label="SLA vencidos" value={c.slaVencidos} icon="fas fa-triangle-exclamation" valueClass={c.slaVencidos > 0 ? "error" : ""} />
    </div>
  );
}
