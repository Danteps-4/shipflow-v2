import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initStockTables, getAllKits, saveKit, deleteKit, KitComponent } from "@/lib/stockDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

// GET /api/stock/kits — todos los kits de la tienda
export async function GET(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initStockTables();
  const kits = await getAllKits(storeId);
  return NextResponse.json({ kits });
}

// POST /api/stock/kits — guardar kit
// Body: { kitSku: string, components: [{ component_sku, cantidad }] }
export async function POST(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { kitSku, components } = await req.json() as { kitSku: string; components: KitComponent[] };
  if (!kitSku || !Array.isArray(components)) {
    return NextResponse.json({ error: "Faltan campos: kitSku, components" }, { status: 400 });
  }

  await initStockTables();
  await saveKit(storeId, kitSku.trim().toUpperCase(), components);
  return NextResponse.json({ ok: true });
}

// DELETE /api/stock/kits?sku=XXX — eliminar definición de kit
export async function DELETE(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sku = req.nextUrl.searchParams.get("sku");
  if (!sku) return NextResponse.json({ error: "Falta sku" }, { status: 400 });

  await initStockTables();
  await deleteKit(storeId, sku);
  return NextResponse.json({ ok: true });
}
