import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initTicketsTables, addAccion, TIPOS_ACCION, TipoAccion } from "@/lib/ticketsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registra una acción de la sección "Resolver ticket". En esta fase esto
// solo guarda la intención (queda en el historial) — no ejecuta nada de
// verdad (no crea un Cambio, no dispara un reembolso, etc).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const body = await req.json() as { tipo?: string; detalle?: string; monto?: number; referencia?: string };
  if (!body.tipo || !TIPOS_ACCION.includes(body.tipo as TipoAccion)) {
    return NextResponse.json({ error: "Tipo de acción inválido" }, { status: 400 });
  }

  await initTicketsTables();
  const accion = await addAccion(Number(params.id), {
    tipo: body.tipo as TipoAccion,
    detalle: body.detalle,
    monto: body.monto,
    referencia: body.referencia,
  }, guard.user.name);
  return NextResponse.json({ accion });
}
