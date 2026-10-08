import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initImportacionesTables, editarLinea, borrarLinea } from "@/lib/importacionesDb";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "importaciones", "/importaciones");
  if (!guard.ok) return guard.response;

  const body = await req.json() as { sku?: string; nombre?: string; cantidadEsperada?: number; impuestosPagados?: boolean };
  if (body.cantidadEsperada !== undefined && (!Number.isInteger(body.cantidadEsperada) || body.cantidadEsperada < 0)) {
    return NextResponse.json({ error: "La cantidad tiene que ser un número entero" }, { status: 400 });
  }

  await initImportacionesTables();
  try {
    const linea = await editarLinea(Number(params.id), {
      sku: body.sku?.trim().toUpperCase(),
      nombre: body.nombre?.trim(),
      cantidadEsperada: body.cantidadEsperada,
      impuestosPagados: body.impuestosPagados,
    });
    return NextResponse.json({ linea });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "importaciones", "/importaciones");
  if (!guard.ok) return guard.response;

  await initImportacionesTables();
  try {
    await borrarLinea(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
