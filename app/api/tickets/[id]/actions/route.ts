import { NextRequest, NextResponse } from "next/server";
import { requireModule, requireTicketsSupervisor } from "@/lib/permissions";
import { initTicketsTables, addAccion, updateAccion, deleteAccion, addCosto, TIPOS_ACCION, TipoAccion, TIPOS_COSTO, TipoCosto } from "@/lib/ticketsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCION_LABELS: Record<TipoAccion, string> = {
  enviar_producto: "Enviar producto",
  cambiar_producto: "Cambiar producto",
  crear_pedido: "Crear pedido",
  modificar_pedido: "Modificar pedido",
  cambiar_direccion: "Cambiar dirección",
  generar_devolucion: "Generar devolución",
  reembolso: "Reembolso",
  cancelar_pedido: "Cancelar pedido",
  reenviar_pedido: "Reenviar pedido",
  generar_link_pago: "Generar link de pago",
  resolver_sin_costo: "Resolver sin costo",
  otra_accion: "Otra acción",
};

// Registra una acción de la sección "Resolver ticket". En esta fase esto
// solo guarda la intención (queda en el historial) — no ejecuta nada de
// verdad (no crea un Cambio, no dispara un reembolso, etc). Opcionalmente,
// si la acción tiene un monto real, se puede sumar también como costo del
// ticket (tabla separada `caso_costos`, no hay vínculo automático entre
// "monto de la acción" y "costo total" salvo que se pida explícitamente acá).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const body = await req.json() as {
    tipo?: string; detalle?: string; monto?: number; referencia?: string;
    agregarComoCosto?: boolean; costoTipo?: string;
  };
  if (!body.tipo || !TIPOS_ACCION.includes(body.tipo as TipoAccion)) {
    return NextResponse.json({ error: "Tipo de acción inválido" }, { status: 400 });
  }

  await initTicketsTables();
  const casoId = Number(params.id);
  const accion = await addAccion(casoId, {
    tipo: body.tipo as TipoAccion,
    detalle: body.detalle,
    monto: body.monto,
    referencia: body.referencia,
  }, guard.user.name);

  if (body.agregarComoCosto && body.monto && body.monto > 0) {
    const costoTipo = body.costoTipo && TIPOS_COSTO.includes(body.costoTipo as TipoCosto) ? body.costoTipo as TipoCosto : "otro";
    await addCosto(casoId, {
      tipo: costoTipo,
      descripcion: `Costo de la acción "${ACCION_LABELS[body.tipo as TipoAccion]}"`,
      monto: body.monto,
    }, guard.user.name);
  }

  return NextResponse.json({ accion });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const body = await req.json() as { accionId?: number; detalle?: string | null; monto?: number | null; referencia?: string | null };
  if (!body.accionId) return NextResponse.json({ error: "Falta accionId" }, { status: 400 });

  await initTicketsTables();
  const accion = await updateAccion(Number(params.id), body.accionId, {
    detalle: body.detalle,
    monto: body.monto,
    referencia: body.referencia,
  }, guard.user.name);
  if (!accion) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ accion });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTicketsSupervisor(req);
  if (!guard.ok) return guard.response;

  const { accionId } = await req.json() as { accionId?: number };
  if (!accionId) return NextResponse.json({ error: "Falta accionId" }, { status: 400 });

  await initTicketsTables();
  const borrado = await deleteAccion(Number(params.id), accionId, guard.user.name);
  if (!borrado) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
