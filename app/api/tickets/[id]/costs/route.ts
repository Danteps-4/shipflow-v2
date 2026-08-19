import { NextRequest, NextResponse } from "next/server";
import { requireModule, requireTicketsSupervisor } from "@/lib/permissions";
import { initTicketsTables, addCosto, deleteCosto, TIPOS_COSTO, TipoCosto } from "@/lib/ticketsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const body = await req.json() as { tipo?: string; descripcion?: string; monto?: number; sku?: string };
  if (!body.tipo || !TIPOS_COSTO.includes(body.tipo as TipoCosto)) {
    return NextResponse.json({ error: "Tipo de costo inválido" }, { status: 400 });
  }
  if (!Number.isFinite(body.monto) || (body.monto ?? 0) <= 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }

  await initTicketsTables();
  const costo = await addCosto(Number(params.id), {
    tipo: body.tipo as TipoCosto,
    descripcion: body.descripcion,
    monto: body.monto!,
    sku: body.sku,
  }, guard.user.name);
  return NextResponse.json({ costo });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTicketsSupervisor(req);
  if (!guard.ok) return guard.response;

  const { costoId } = await req.json() as { costoId?: number };
  if (!costoId) return NextResponse.json({ error: "Falta costoId" }, { status: 400 });

  await initTicketsTables();
  const borrado = await deleteCosto(Number(params.id), costoId, guard.user.name);
  if (!borrado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
