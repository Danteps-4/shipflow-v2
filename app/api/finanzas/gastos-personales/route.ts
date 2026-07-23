import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import {
  initFinanzasTables,
  getGastosPersonales,
  createGastoPersonal,
  updateGastoPersonal,
  deleteGastoPersonal,
} from "@/lib/finanzasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gastos personales: son de la cuenta en general, no de una tienda en
// particular, así que estas rutas no dependen de qué tienda esté activa.

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  await initFinanzasTables();
  const gastos = await getGastosPersonales();
  return NextResponse.json({ gastos });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const { fecha, descripcion, monto } = await req.json();
  const montoNum = Number(monto);
  if (!fecha || !descripcion || !montoNum || montoNum <= 0)
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  const gasto = await createGastoPersonal(fecha, descripcion, montoNum);
  return NextResponse.json({ gasto });
}

export async function PUT(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const { id, fecha, descripcion, monto } = await req.json();
  const montoNum = Number(monto);
  if (!id || !fecha || !descripcion || !montoNum || montoNum <= 0)
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  const gasto = await updateGastoPersonal(Number(id), fecha, descripcion, montoNum);
  if (!gasto) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ gasto });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const ok = await deleteGastoPersonal(Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
