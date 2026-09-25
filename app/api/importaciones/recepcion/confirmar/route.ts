import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initImportacionesTables, confirmarCaja } from "@/lib/importacionesDb";

export const runtime = "nodejs";

// Paso 2 del escaneo de recepción: confirma una caja física puntual (ya
// elegido a mano qué línea/producto es) y suma al stock real.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "importaciones", "/importaciones/recepcion");
  if (!guard.ok) return guard.response;

  const body = await req.json() as { compraId?: number; lineaId?: number; cantidad?: number; codigo?: string };
  if (!body.compraId || !body.lineaId || !body.cantidad || body.cantidad <= 0 || !body.codigo?.trim()) {
    return NextResponse.json({ error: "Faltan datos para confirmar la caja" }, { status: 400 });
  }

  await initImportacionesTables();
  try {
    const resultado = await confirmarCaja({
      compraId: body.compraId, lineaId: body.lineaId, cantidad: body.cantidad,
      trackingNumberEscaneado: body.codigo.trim(), scannedBy: guard.user.name,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
