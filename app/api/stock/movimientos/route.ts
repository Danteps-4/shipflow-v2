import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initStockTables, getMovimientos, ajustarStock } from "@/lib/stockDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initStockTables();
  const movimientos = await getMovimientos(storeId);
  return NextResponse.json({ movimientos });
}

export async function POST(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { sku, nombre, delta, motivo } = await req.json();
  if (!sku || typeof delta !== "number") {
    return NextResponse.json({ error: "Faltan campos: sku, delta" }, { status: 400 });
  }

  await initStockTables();
  await ajustarStock(storeId, String(sku).trim().toUpperCase(), String(nombre ?? sku).trim(), delta, motivo ?? "Ajuste manual");
  return NextResponse.json({ ok: true });
}
