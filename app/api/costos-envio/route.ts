import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initCostosEnvioTables, getCostosEnvio, createCostoEnvio, deleteCostoEnvio } from "@/lib/costosEnvioDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

// Se usa solo desde /procesar, así que se gatea por el módulo "pedidos"
// en general (no hay un sub apartado propio de esta ruta).
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initCostosEnvioTables();
  const costos = await getCostosEnvio(storeId);
  return NextResponse.json({ costos });
}

// Body: { cantidadEnvios, costoTotal } — un registro puramente estadístico,
// no un gasto: no toca gastos_negocio en ningún momento.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as { cantidadEnvios?: number; costoTotal?: number; fecha?: string };
  const cantidadEnvios = Number(body.cantidadEnvios);
  const costoTotal = Number(body.costoTotal);
  if (!Number.isFinite(cantidadEnvios) || cantidadEnvios <= 0) {
    return NextResponse.json({ error: "cantidadEnvios inválido" }, { status: 400 });
  }
  if (!Number.isFinite(costoTotal) || costoTotal <= 0) {
    return NextResponse.json({ error: "costoTotal inválido" }, { status: 400 });
  }
  const fecha = body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : undefined;

  await initCostosEnvioTables();
  const costo = await createCostoEnvio(storeId, { cantidadEnvios, costoTotal, createdBy: guard.user.name, fecha });
  return NextResponse.json({ costo });
}

// Por si se carga un valor equivocado y hay que corregirlo.
export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initCostosEnvioTables();
  const ok = await deleteCostoEnvio(storeId, Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
