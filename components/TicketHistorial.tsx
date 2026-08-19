export interface TicketHistorialEntryUI {
  id: number;
  tipo: string;
  descripcion: string;
  created_by: string;
  created_at: string;
}

const TIPO_ICONS: Record<string, string> = {
  creacion: "fas fa-plus",
  cambio_estado: "fas fa-arrows-rotate",
  cambio_responsable: "fas fa-user",
  comentario: "fas fa-comment",
  archivo: "fas fa-paperclip",
  accion: "fas fa-wrench",
  costo: "fas fa-coins",
  otro: "fas fa-circle-info",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TicketHistorial({ historial }: { historial: TicketHistorialEntryUI[] }) {
  if (historial.length === 0) {
    return <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontStyle: "italic" }}>Sin actividad todavía.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {historial.map(h => (
        <div key={h.id} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: "rgba(99,102,241,0.12)", color: "var(--primary-color)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem",
          }}>
            <i className={TIPO_ICONS[h.tipo] ?? "fas fa-circle"} />
          </div>
          <div>
            <p style={{ fontSize: "0.85rem" }}>{h.descripcion}</p>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{h.created_by || "—"} · {fmtDateTime(h.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
