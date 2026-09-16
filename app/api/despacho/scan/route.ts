import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initDespachoTables, procesarEscaneo } from "@/lib/despachoDb";

export const runtime = "nodejs";

// Ruta caliente: se llama en cada Enter del lector USB del puesto de
// despacho. Toda la validación/resolución/registro vive en procesarEscaneo,
// esta ruta solo hace de guard de permisos + parseo del body.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "despacho", "/despacho");
  if (!guard.ok) return guard.response;

  const { codigo } = await req.json() as { codigo?: string };
  if (!codigo || !codigo.trim()) {
    return NextResponse.json({ error: "Falta el código escaneado" }, { status: 400 });
  }

  await initDespachoTables();
  const outcome = await procesarEscaneo(codigo, guard.user.name);
  return NextResponse.json(outcome);
}
