import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule, requireRetirosSupervisor } from "@/lib/permissions";
import { initRetirosTables, getRetiroById, updateRetiroCampos, deleteRetiro } from "@/lib/retirosDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initRetirosTables();
  const retiro = await getRetiroById(storeId, Number(params.id));
  if (!retiro) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ retiro });
}

interface PatchBody {
  fechaEstimada?: string | null;
  notas?: string | null;
}

// Edita solo los campos no sensibles (fecha estimada, notas). Los cambios
// de estado viven en accion/route.ts, con sus propias reglas de negocio.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as PatchBody;
  await initRetirosTables();
  const retiro = await updateRetiroCampos(storeId, Number(params.id), body, guard.user.name);
  if (!retiro) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ retiro });
}

// Borrado duro — reservado a supervisión (el flujo normal para un retiro
// que no corresponde es cancelarlo, no borrarlo; esto es para corregir una
// carga por error).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRetirosSupervisor(req);
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initRetirosTables();
  const ok = await deleteRetiro(storeId, Number(params.id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
