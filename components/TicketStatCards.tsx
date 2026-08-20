interface TicketCounts {
  totalAbiertos: number;
  pendientesSupervision: number;
  enGestion: number;
  esperandoCliente: number;
  esperandoDevolucion: number;
  urgentes: number;
  slaVencidos: number;
}

// Cuadros compactos, propios de este componente (no tocan .sf-stat-card/
// .sf-summary-grid, que se usan en otras pantallas con menos tarjetas y más
// grandes — acá son 7 y conviene que ocupen menos espacio vertical).
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color?: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "0.6rem",
        background: "var(--surface-color)", border: "1px solid var(--border-color)",
        borderRadius: "var(--radius)", padding: "0.55rem 0.7rem",
      }}
    >
      <i className={icon} style={{ fontSize: "0.95rem", color: color ?? "var(--text-muted)", width: "1.1rem", textAlign: "center", flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "1.15rem", fontWeight: 700, lineHeight: 1.1, color: color ?? "var(--text-color)" }}>{value}</div>
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      </div>
    </div>
  );
}

export default function TicketStatCards({ counts }: { counts: TicketCounts | null }) {
  const c = counts ?? {
    totalAbiertos: 0, pendientesSupervision: 0, enGestion: 0,
    esperandoCliente: 0, esperandoDevolucion: 0, urgentes: 0, slaVencidos: 0,
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.6rem" }}>
      <StatCard label="Total abiertos" value={c.totalAbiertos} icon="fas fa-ticket" />
      <StatCard label="Pendientes de supervisión" value={c.pendientesSupervision} icon="fas fa-user-shield" />
      <StatCard label="En gestión" value={c.enGestion} icon="fas fa-gears" />
      <StatCard label="Esperando cliente" value={c.esperandoCliente} icon="fas fa-clock" />
      <StatCard label="Esperando devolución" value={c.esperandoDevolucion} icon="fas fa-truck-ramp-box" />
      <StatCard label="Urgentes" value={c.urgentes} icon="fas fa-bolt" color={c.urgentes > 0 ? "var(--error-color)" : undefined} />
      <StatCard label="SLA vencidos" value={c.slaVencidos} icon="fas fa-triangle-exclamation" color={c.slaVencidos > 0 ? "var(--error-color)" : undefined} />
    </div>
  );
}
