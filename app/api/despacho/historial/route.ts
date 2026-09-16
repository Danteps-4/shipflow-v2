import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initDespachoTables, getHistorialEscaneos, EstadoScan } from "@/lib/despachoDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "despacho", "/despacho");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");

  await initDespachoTables();
  const historial = await getHistorialEscaneos({
    q:           sp.get("q") ?? undefined,
    numeroOrden: sp.get("numeroOrden") ?? undefined,
    tracking:    sp.get("tracking") ?? undefined,
    scannedBy:   sp.get("scannedBy") ?? undefined,
    status:      status === "success" || status === "error" ? status as EstadoScan : undefined,
    carrier:     sp.get("carrier") ?? undefined,
    desde:       sp.get("desde") ?? undefined,
    hasta:       sp.get("hasta") ?? undefined,
    limit:       sp.get("limit") ? Number(sp.get("limit")) : undefined,
  });
  return NextResponse.json({ historial });
}
