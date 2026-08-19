import { labelCategoria } from "@/lib/ticketCategorias";

export interface TicketResumenClienteUI {
  id: number;
  numero_pedido: string;
  categoria: string;
  estado: string;
  created_at: string;
}

const ESTADOS_ABIERTOS = new Set(["nuevo", "pendiente_supervision", "en_gestion", "esperando_cliente", "esperando_pago", "esperando_devolucion", "esperando_logistica"]);

const CONTADORES_RESUMEN: { tipo: string; label: string }[] = [
  { tipo: "cambiar_producto", label: "Cambios de producto" },
  { tipo: "enviar_producto", label: "Reemplazos enviados" },
  { tipo: "generar_devolucion", label: "Devoluciones" },
  { tipo: "reembolso", label: "Reembolsos" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function TicketClienteHistorial({
  otrosTickets, accionesResumen,
}: {
  otrosTickets: TicketResumenClienteUI[];
  accionesResumen: Record<string, number>;
}) {
  const hayAbierto = otrosTickets.some(t => ESTADOS_ABIERTOS.has(t.estado));

  return (
    <div>
      <div className="sf-section-title" style={{ marginBottom: "0.5rem" }}>
        <div className="sf-step-badge"><i className="fas fa-clock-rotate-left" style={{ fontSize: "0.65rem" }} /></div>
        <div>
          <h2>Historial del cliente</h2>
          <p>{otrosTickets.length} ticket{otrosTickets.length !== 1 ? "s" : ""} más de esta persona</p>
        </div>
      </div>

      {hayAbierto && (
        <div className="sf-alert sf-alert-warning" style={{ marginBottom: "0.85rem" }}>
          <i className="fas fa-triangle-exclamation" style={{ marginTop: "2px", flexShrink: 0 }} />
          <span>Este cliente ya tiene otro ticket abierto.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
        {CONTADORES_RESUMEN.map(c => (
          <div key={c.tipo} style={{ textAlign: "center", minWidth: 90 }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{accionesResumen[c.tipo] ?? 0}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{c.label}</div>
          </div>
        ))}
      </div>

      {otrosTickets.length === 0 ? (
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontStyle: "italic" }}>No tiene otros tickets.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {otrosTickets.map(t => (
            <a
              key={t.id}
              href={`/tickets/${t.id}`}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem",
                border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
                padding: "0.5rem 0.7rem", fontSize: "0.8rem", color: "var(--text-color)", textDecoration: "none",
              }}
            >
              <span>#{t.id} · {labelCategoria(t.categoria)} · Pedido #{t.numero_pedido}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{fmtDate(t.created_at)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
