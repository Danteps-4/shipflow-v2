import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initStockTables, getReposiciones, createReposicion, deleteReposicion } from "@/lib/stockDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "stock", "/stock");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initStockTables();
  const reposiciones = await getReposiciones(storeId);
  return NextResponse.json({ reposiciones });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "stock", "/stock");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { sku, cantidad, fechaLlegada, nota } = await req.json();
  if (!sku || typeof cantidad !== "number" || !fechaLlegada) {
    return NextResponse.json({ error: "Faltan campos: sku, cantidad, fechaLlegada" }, { status: 400 });
  }

  await initStockTables();
  const reposicion = await createReposicion(
    storeId, String(sku).trim().toUpperCase(), cantidad, String(fechaLlegada), String(nota ?? "").trim(),
  );
  return NextResponse.json({ reposicion });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "stock", "/stock");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initStockTables();
  await deleteReposicion(storeId, Number(id));
  return NextResponse.json({ ok: true });
}
