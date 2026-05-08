import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initStockTables, deducirStock, DeducirItem } from "@/lib/stockDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function POST(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { items } = await req.json() as { items: DeducirItem[] };
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ insuficiente: [] });
  }

  await initStockTables();
  const result = await deducirStock(storeId, items);
  return NextResponse.json(result);
}
