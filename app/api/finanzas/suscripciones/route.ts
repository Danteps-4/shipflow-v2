import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import {
  initFinanzasTables,
  getSuscripciones,
  createSuscripcion,
  updateSuscripcion,
  deleteSuscripcion,
} from "@/lib/finanzasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initFinanzasTables();
  const suscripciones = await getSuscripciones(storeId);
  return NextResponse.json({ suscripciones });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { nombre, monto, frecuencia, fecha_prox_pago } = await req.json();
  if (!nombre || !monto || !fecha_prox_pago)
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  const suscripcion = await createSuscripcion(
    storeId,
    nombre,
    Number(monto),
    frecuencia ?? "mensual",
    fecha_prox_pago,
  );
  return NextResponse.json({ suscripcion });
}

export async function PUT(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id, nombre, monto, frecuencia, fecha_prox_pago, activa } = await req.json();
  if (!id || !nombre || !monto || !fecha_prox_pago)
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  const suscripcion = await updateSuscripcion(
    storeId,
    Number(id),
    nombre,
    Number(monto),
    frecuencia ?? "mensual",
    fecha_prox_pago,
    activa !== false,
  );
  if (!suscripcion) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ suscripcion });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const ok = await deleteSuscripcion(storeId, Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
