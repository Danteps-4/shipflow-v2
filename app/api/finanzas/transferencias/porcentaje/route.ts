import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initFinanzasTables, getPorcentajeFinancieraDefault, setPorcentajeFinancieraDefault } from "@/lib/finanzasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

// Porcentaje "fijo" que cobra la financiera, para no tener que cargarlo de
// nuevo cada vez que se cierra el día.
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/transferencias");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initFinanzasTables();
  const porcentaje = await getPorcentajeFinancieraDefault(storeId);
  return NextResponse.json({ porcentaje });
}

export async function PUT(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/transferencias");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { porcentaje } = await req.json();
  const porcentajeNum = Number(porcentaje);
  if (isNaN(porcentajeNum) || porcentajeNum < 0 || porcentajeNum > 100) {
    return NextResponse.json({ error: "Porcentaje inválido" }, { status: 400 });
  }

  await initFinanzasTables();
  const guardado = await setPorcentajeFinancieraDefault(storeId, porcentajeNum);
  return NextResponse.json({ porcentaje: guardado });
}
