import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initImportacionesTables, getContadoresRecepcionHoy } from "@/lib/importacionesDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "importaciones", "/importaciones/recepcion");
  if (!guard.ok) return guard.response;

  const fecha = req.nextUrl.searchParams.get("fecha") ?? undefined;
  await initImportacionesTables();
  const contadores = await getContadoresRecepcionHoy(fecha);
  return NextResponse.json(contadores);
}
