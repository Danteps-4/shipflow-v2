import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initStockTables, getMovimientos, ajustarStock } from "@/lib/stockDb";

export const runtime = "nodejs";

// GET /api/stock/movimientos
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initStockTables();
  const movimientos = await getMovimientos(userId);
  return NextResponse.json({ movimientos });
}

// POST /api/stock/movimientos — ajuste manual (+/-)
// Body: { sku, nombre, delta, motivo }
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { sku, nombre, delta, motivo } = await req.json();
  if (!sku || typeof delta !== "number") {
    return NextResponse.json({ error: "Faltan campos: sku, delta" }, { status: 400 });
  }

  await initStockTables();
  await ajustarStock(userId, String(sku).trim().toUpperCase(), String(nombre ?? sku).trim(), delta, motivo ?? "Ajuste manual");
  return NextResponse.json({ ok: true });
}
