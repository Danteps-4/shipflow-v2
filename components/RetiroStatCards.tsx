interface RetiroCounts {
  pendientesPreparar: number;
  listos: number;
  paraHoy: number;
  cobrosPendientes: number;
}

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

export default function RetiroStatCards({ counts }: { counts: RetiroCounts | null }) {
  const c = counts ?? { pendientesPreparar: 0, listos: 0, paraHoy: 0, cobrosPendientes: 0 };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem" }}>
      <StatCard label="Pendientes de preparar" value={c.pendientesPreparar} icon="fas fa-box" />
      <StatCard label="Listos para retirar" value={c.listos} icon="fas fa-circle-check" color={c.listos > 0 ? "var(--primary-color)" : undefined} />
      <StatCard label="Para hoy" value={c.paraHoy} icon="fas fa-calendar-day" color={c.paraHoy > 0 ? "var(--warning-color)" : undefined} />
      <StatCard label="Cobros pendientes" value={c.cobrosPendientes} icon="fas fa-coins" color={c.cobrosPendientes > 0 ? "var(--error-color)" : undefined} />
    </div>
  );
}
