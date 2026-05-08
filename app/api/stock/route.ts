import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initStockTables, getStock, upsertStockItem, deleteStockItem } from "@/lib/stockDb";

export const runtime = "nodejs";

async function auth(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return null;
  return userId;
}

// GET /api/stock — listar stock del usuario
export async function GET(req: NextRequest) {
  const userId = await auth(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initStockTables();
  const items = await getStock(userId);
  return NextResponse.json({ items });
}

// POST /api/stock — crear o actualizar un ítem
export async function POST(req: NextRequest) {
  const userId = await auth(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { sku, nombre, cantidad } = await req.json();
  if (!sku || typeof cantidad !== "number") {
    return NextResponse.json({ error: "Faltan campos: sku, cantidad" }, { status: 400 });
  }

  await initStockTables();
  await upsertStockItem(userId, String(sku).trim().toUpperCase(), String(nombre ?? "").trim(), cantidad);
  return NextResponse.json({ ok: true });
}

// DELETE /api/stock?sku=XXX — eliminar un ítem
export async function DELETE(req: NextRequest) {
  const userId = await auth(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sku = req.nextUrl.searchParams.get("sku");
  if (!sku) return NextResponse.json({ error: "Falta sku" }, { status: 400 });

  await initStockTables();
  await deleteStockItem(userId, sku);
  return NextResponse.json({ ok: true });
}
