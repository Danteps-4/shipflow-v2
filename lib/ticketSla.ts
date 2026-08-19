// SLA por prioridad. Los umbrales están hardcodeados a propósito por ahora
// (no hay pantalla de configuración todavía) — es una constante, no una
// tabla, exactamente como lib/ticketCategorias.ts.

export const PRIORIDADES_TICKET = ["normal", "alta", "urgente"] as const;
export type PrioridadTicket = (typeof PRIORIDADES_TICKET)[number];

export const SLA_HORAS_POR_PRIORIDAD: Record<PrioridadTicket, number> = {
  normal: 24,
  alta: 8,
  urgente: 2,
};

export function computeSlaVencimiento(prioridad: string, desde: Date = new Date()): Date {
  const horas = SLA_HORAS_POR_PRIORIDAD[prioridad as PrioridadTicket] ?? SLA_HORAS_POR_PRIORIDAD.normal;
  return new Date(desde.getTime() + horas * 60 * 60 * 1000);
}

const ESTADOS_TERMINALES = new Set(["resuelto", "cerrado", "cancelado"]);

export function isVencido(slaVencimiento: string | null, estado: string): boolean {
  if (!slaVencimiento || ESTADOS_TERMINALES.has(estado)) return false;
  return new Date(slaVencimiento).getTime() < Date.now();
}
