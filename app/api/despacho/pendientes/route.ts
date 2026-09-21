import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initDespachoTables, getEtiquetasGeneradasHoy, getPendientesDeEscaneo, getResumenStockHoy } from "@/lib/despachoDb";

export const runtime = "nodejs";

// Comparación "etiquetas generadas hoy" vs "paquetes efectivamente
// escaneados" — permite detectar antes de que se vaya el transportista que
// quedaron paquetes sin escanear. De paso trae el resumen de stock por SKU
// (esperado vs escaneado) para el mismo panel.
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "despacho", "/despacho");
  if (!guard.ok) return guard.response;

  const fecha = req.nextUrl.searchParams.get("fecha") ?? undefined;
  await initDespachoTables();
  const [generadas, pendientes, resumenStock] = await Promise.all([
    getEtiquetasGeneradasHoy(fecha),
    getPendientesDeEscaneo(fecha),
    getResumenStockHoy(fecha),
  ]);
  return NextResponse.json({ generadas, pendientes, resumenStock });
}
