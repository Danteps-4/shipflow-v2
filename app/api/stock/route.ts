import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initStockTables, getStock, upsertStockItem, deleteStockItem, setDestacado, setImportado } from "@/lib/stockDb";

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

  await initStockTables();
  const items = await getStock(storeId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "stock");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { sku, nombre, cantidad } = await req.json();
  if (!sku || typeof cantidad !== "number") {
    return NextResponse.json({ error: "Faltan campos: sku, cantidad" }, { status: 400 });
  }

  await initStockTables();
  await upsertStockItem(storeId, String(sku).trim().toUpperCase(), String(nombre ?? "").trim(), cantidad);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "stock");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { sku, destacado, importado } = await req.json();
  if (!sku || (typeof destacado !== "boolean" && typeof importado !== "boolean")) {
    return NextResponse.json({ error: "Faltan campos: sku, destacado o importado" }, { status: 400 });
  }

  await initStockTables();
  if (typeof destacado === "boolean") await setDestacado(storeId, String(sku), destacado);
  if (typeof importado === "boolean") await setImportado(storeId, String(sku), importado);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "stock");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sku = req.nextUrl.searchParams.get("sku");
  if (!sku) return NextResponse.json({ error: "Falta sku" }, { status: 400 });

  await initStockTables();
  await deleteStockItem(storeId, sku);
  return NextResponse.json({ ok: true });
}
