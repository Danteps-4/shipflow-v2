import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initImportacionesTables, agregarLinea } from "@/lib/importacionesDb";

export const runtime = "nodejs";

// Agrega un producto (fila nueva) a una compra existente desde la grilla.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "importaciones", "/importaciones");
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({})) as { sku?: string; nombre?: string; cantidadEsperada?: number };

  await initImportacionesTables();
  try {
    const linea = await agregarLinea(Number(params.id), {
      sku: body.sku?.trim().toUpperCase(), nombre: body.nombre?.trim(), cantidadEsperada: body.cantidadEsperada,
    });
    return NextResponse.json({ linea });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
