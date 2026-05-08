import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initStockTables, deducirStock, DeducirItem } from "@/lib/stockDb";

export const runtime = "nodejs";

// POST /api/stock/deducir
// Body: { items: [{ sku, nombre, cantidad, motivo }] }
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { items } = await req.json() as { items: DeducirItem[] };
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ insuficiente: [] });
  }

  await initStockTables();
  const result = await deducirStock(userId, items);
  return NextResponse.json(result);
}
