import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import {
  initFinanzasTables,
  getGastos,
  createGasto,
  updateGasto,
  deleteGasto,
} from "@/lib/finanzasDb";

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

  await initFinanzasTables();
  const gastos = await getGastos(storeId);
  return NextResponse.json({ gastos });
}

export async function POST(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { descripcion, monto, categoria, fecha } = await req.json();
  if (!descripcion || !monto || !fecha)
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  const gasto = await createGasto(storeId, descripcion, Number(monto), categoria ?? "Otros", fecha);
  return NextResponse.json({ gasto });
}

export async function PUT(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id, descripcion, monto, categoria, fecha } = await req.json();
  if (!id || !descripcion || !monto || !fecha)
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  const gasto = await updateGasto(storeId, Number(id), descripcion, Number(monto), categoria ?? "Otros", fecha);
  if (!gasto) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ gasto });
}

export async function DELETE(req: NextRequest) {
  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const ok = await deleteGasto(storeId, Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
