import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initDespachoTables, getEtiquetasGeneradasHoy, getPendientesDeEscaneo } from "@/lib/despachoDb";

export const runtime = "nodejs";

// Comparación "etiquetas generadas hoy" vs "paquetes efectivamente
// escaneados" — permite detectar antes de que se vaya el transportista que
// quedaron paquetes sin escanear.
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "despacho", "/despacho");
  if (!guard.ok) return guard.response;

  const fecha = req.nextUrl.searchParams.get("fecha") ?? undefined;
  await initDespachoTables();
  const [generadas, pendientes] = await Promise.all([
    getEtiquetasGeneradasHoy(fecha),
    getPendientesDeEscaneo(fecha),
  ]);
  return NextResponse.json({ generadas, pendientes });
}
