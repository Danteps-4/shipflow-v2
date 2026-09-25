import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initImportacionesTables, getCompraById, editarCompra, borrarCompra, EdicionCompraInput } from "@/lib/importacionesDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "importaciones", "/importaciones");
  if (!guard.ok) return guard.response;

  await initImportacionesTables();
  const compra = await getCompraById(Number(params.id));
  if (!compra) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ compra });
}

interface EdicionBody {
  fechaCompra?: string; fechaLlegadaEstimada?: string | null;
  dap?: number | null; pague?: number | null; precioUsd?: number | null;
  declaro?: number | null; impuestos?: number | null; totalArs?: number | null;
  nota?: string;
  lineas?: { sku?: string; nombre?: string; cantidadEsperada?: number; unidadesPorCaja?: number | null }[];
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "importaciones", "/importaciones");
  if (!guard.ok) return guard.response;

  const body = await req.json() as EdicionBody;
  const input: EdicionCompraInput = {
    fechaCompra: body.fechaCompra, fechaLlegadaEstimada: body.fechaLlegadaEstimada,
    dap: body.dap, pague: body.pague, precioUsd: body.precioUsd,
    declaro: body.declaro, impuestos: body.impuestos, totalArs: body.totalArs, nota: body.nota,
    lineas: body.lineas
      ? body.lineas.filter(l => l.sku?.trim() && typeof l.cantidadEsperada === "number" && l.cantidadEsperada > 0)
          .map(l => ({ sku: l.sku!.trim().toUpperCase(), nombre: l.nombre, cantidadEsperada: l.cantidadEsperada!, unidadesPorCaja: l.unidadesPorCaja ?? null }))
      : undefined,
  };

  await initImportacionesTables();
  try {
    const compra = await editarCompra(Number(params.id), input);
    return NextResponse.json({ compra });
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
    await borrarCompra(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
