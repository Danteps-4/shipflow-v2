import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initReclamosTables, getListas, createLista, deleteLista } from "@/lib/reclamosDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "reclamos", "/reclamos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initReclamosTables();
  const listas = await getListas(storeId);
  return NextResponse.json({ listas });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "reclamos", "/reclamos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { nombre } = await req.json();
  if (!nombre || !String(nombre).trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  await initReclamosTables();
  const lista = await createLista(storeId, String(nombre).trim());
  return NextResponse.json({ lista });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "reclamos", "/reclamos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initReclamosTables();
  const borrado = await deleteLista(storeId, Number(id));
  if (!borrado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
