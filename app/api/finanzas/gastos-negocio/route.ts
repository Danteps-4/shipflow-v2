import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import {
  initFinanzasTables,
  getGastosNegocio,
  createGastoNegocio,
  updateGastoNegocio,
  deleteGastoNegocio,
} from "@/lib/finanzasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gastos del negocio: son de la cuenta en general, no de una tienda en
// particular, así que estas rutas no dependen de qué tienda esté activa.

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  await initFinanzasTables();
  const gastos = await getGastosNegocio();
  return NextResponse.json({ gastos });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  const { fecha, persona, categoria, detalle, cantidad, monto, pagado } = await req.json();
  const montoNum = Number(monto);
  if (!fecha || !montoNum || montoNum <= 0)
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  const gasto = await createGastoNegocio({
    fecha,
    persona: persona || null,
    categoria: categoria || "Otros",
    detalle: detalle || null,
    cantidad: cantidad !== undefined && cantidad !== null && cantidad !== "" ? Number(cantidad) : null,
    monto: montoNum,
    pagado: !!pagado,
  });
  return NextResponse.json({ gasto });
}

// Body: { id, ...campos a cambiar } — permite tildar "pagado" solo, o
// editar cualquier otro campo.
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  const { id, fecha, persona, categoria, detalle, cantidad, monto, pagado } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const gasto = await updateGastoNegocio(Number(id), {
    fecha,
    persona: persona !== undefined ? (persona || null) : undefined,
    categoria,
    detalle: detalle !== undefined ? (detalle || null) : undefined,
    cantidad: cantidad !== undefined ? (cantidad !== null && cantidad !== "" ? Number(cantidad) : null) : undefined,
    monto: monto !== undefined ? Number(monto) : undefined,
    pagado,
  });
  if (!gasto) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ gasto });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const ok = await deleteGastoNegocio(Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
