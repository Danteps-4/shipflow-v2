import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initStockTables, getVentasSemanales } from "@/lib/stockDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "stock");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const hoy = new Date();
  const hastaDefault = hoy.toISOString().slice(0, 10);
  const desdeDefault = new Date(hoy.getTime() - 8 * 7 * 86400000).toISOString().slice(0, 10);
  let desde = req.nextUrl.searchParams.get("desde") ?? desdeDefault;
  let hasta = req.nextUrl.searchParams.get("hasta") ?? hastaDefault;
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  await initStockTables();
  const ventas = await getVentasSemanales(storeId, desde, hasta);
  return NextResponse.json({ ventas, desde, hasta });
}
