import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initPedidoExtrasTables, getExtrasPorOrdenes, createExtra, deleteExtra } from "@/lib/pedidoExtrasDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/orders");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const numeros = (req.nextUrl.searchParams.get("numeros") ?? "")
    .split(",")
    .map(n => n.trim())
    .filter(Boolean);

  await initPedidoExtrasTables();
  const extras = await getExtrasPorOrdenes(storeId, numeros);
  return NextResponse.json({ extras });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/orders");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { numeroOrden, sku, cantidad, nota } = await req.json();
  if (!numeroOrden || !sku) {
    return NextResponse.json({ error: "Faltan campos: numeroOrden, sku" }, { status: 400 });
  }

  await initPedidoExtrasTables();
  const extra = await createExtra(
    storeId,
    String(numeroOrden),
    String(sku).trim().toUpperCase(),
    Math.max(1, Number(cantidad) || 1),
    String(nota ?? "").trim(),
  );
  return NextResponse.json({ extra });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/orders");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initPedidoExtrasTables();
  await deleteExtra(storeId, Number(id));
  return NextResponse.json({ ok: true });
}
