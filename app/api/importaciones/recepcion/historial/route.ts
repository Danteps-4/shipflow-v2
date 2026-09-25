import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initImportacionesTables, getHistorialRecepcion } from "@/lib/importacionesDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "importaciones", "/importaciones/recepcion");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  await initImportacionesTables();
  const historial = await getHistorialRecepcion({
    compraId: sp.get("compraId") ? Number(sp.get("compraId")) : undefined,
    tracking: sp.get("tracking") ?? undefined,
    desde: sp.get("desde") ?? undefined,
    hasta: sp.get("hasta") ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
  });
  return NextResponse.json({ historial });
}
