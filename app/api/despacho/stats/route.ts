import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initDespachoTables, getContadoresHoy } from "@/lib/despachoDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "despacho", "/despacho");
  if (!guard.ok) return guard.response;

  const fecha = req.nextUrl.searchParams.get("fecha") ?? undefined;
  await initDespachoTables();
  const contadores = await getContadoresHoy(fecha);
  return NextResponse.json(contadores);
}
