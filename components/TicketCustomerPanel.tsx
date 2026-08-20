"use client";

import { useState } from "react";
import ContactoRow, { whatsappHref, instagramHref } from "@/components/ContactoRow";
import TicketClienteHistorial, { TicketResumenClienteUI } from "@/components/TicketClienteHistorial";
import TicketHistorial, { TicketHistorialEntryUI } from "@/components/TicketHistorial";

function fmtMesAnio(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

interface ContactField {
  value: string | null;
  editing: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onStart: () => void;
  onCancel: () => void;
  onSave: () => void;
}

// Panel fijo a la derecha del detalle del ticket: identidad del cliente,
// todos sus contactos, el historial de otros tickets y el historial de
// eventos de este caso — todo en un solo lugar en vez de repartido por la
// página.
export default function TicketCustomerPanel({
  clienteNombre, telefono, instagram, email,
  saving, otrosTickets, accionesResumen, historial, creadoEn, numeroPedido,
}: {
  clienteNombre: string;
  telefono: ContactField;
  instagram: ContactField;
  email: ContactField;
  saving: boolean;
  otrosTickets: TicketResumenClienteUI[];
  accionesResumen: Record<string, number>;
  historial: TicketHistorialEntryUI[];
  creadoEn: string;
  numeroPedido: string;
}) {
  const [historialAbierto, setHistorialAbierto] = useState(false);

  const fechas = [creadoEn, ...otrosTickets.map(t => t.created_at)];
  const clienteDesde = fechas.reduce((min, f) => (f < min ? f : min), fechas[0]);
  const pedidosUnicos = new Set([numeroPedido, ...otrosTickets.map(t => t.numero_pedido)]).size;
  const ticketsCount = 1 + otrosTickets.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
          background: "rgba(99,102,241,0.15)", color: "var(--primary-color)",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1rem",
        }}>
          {iniciales(clienteNombre || "?")}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {clienteNombre || "Sin nombre"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Cliente desde {fmtMesAnio(clienteDesde)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.6rem" }}>
        <div style={{ flex: 1, textAlign: "center", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.5rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{pedidosUnicos}</div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Pedidos</div>
        </div>
        <div style={{ flex: 1, textAlign: "center", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.5rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{ticketsCount}</div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Tickets</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-color)" }} />

      <div>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Contactos
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <ContactoRow
            icon="fab fa-whatsapp" iconColor="#25D366" label="Teléfono"
            value={telefono.value} href={telefono.value ? whatsappHref(telefono.value) : undefined}
            editing={telefono.editing} draft={telefono.draft} setDraft={telefono.setDraft} saving={saving}
            placeholder="ej. 5491122334455"
            onStart={telefono.onStart} onCancel={telefono.onCancel} onSave={telefono.onSave}
          />
          <ContactoRow
            icon="fab fa-instagram" iconColor="#e1306c" label="Instagram"
            value={instagram.value} href={instagram.value ? instagramHref(instagram.value) : undefined}
            editing={instagram.editing} draft={instagram.draft} setDraft={instagram.setDraft} saving={saving}
            placeholder="ej. @usuario"
            onStart={instagram.onStart} onCancel={instagram.onCancel} onSave={instagram.onSave}
          />
          <ContactoRow
            icon="fas fa-envelope" iconColor="#60a5fa" label="Email"
            value={email.value} href={email.value ? `mailto:${email.value}` : undefined}
            editing={email.editing} draft={email.draft} setDraft={email.setDraft} saving={saving}
            placeholder="ej. cliente@mail.com"
            onStart={email.onStart} onCancel={email.onCancel} onSave={email.onSave}
          />
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-color)" }} />

      <TicketClienteHistorial otrosTickets={otrosTickets} accionesResumen={accionesResumen} />

      <div style={{ borderTop: "1px solid var(--border-color)" }} />

      <div>
        <button
          onClick={() => setHistorialAbierto(a => !a)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", font: "inherit",
          }}
        >
          <div className="sf-section-title" style={{ marginBottom: 0 }}>
            <div className="sf-step-badge"><i className="fas fa-clock-rotate-left" style={{ fontSize: "0.65rem" }} /></div>
            <div><h2>Historial</h2><p>{historial.length} evento{historial.length !== 1 ? "s" : ""}</p></div>
          </div>
          <i className={`fas fa-chevron-${historialAbierto ? "up" : "down"}`} style={{ color: "var(--text-muted)", fontSize: "0.8rem" }} />
        </button>
        {historialAbierto && (
          <div style={{ marginTop: "0.75rem" }}>
            <TicketHistorial historial={historial} />
          </div>
        )}
      </div>
    </div>
  );
}
