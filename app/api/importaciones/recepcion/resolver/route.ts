import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initImportacionesTables, resolverEscaneoRecepcion } from "@/lib/importacionesDb";

export const runtime = "nodejs";

// Paso 1 del escaneo de recepción: solo lectura. Devuelve el desglose de la
// compra (líneas con esperado/recibido) para que el operario elija a mano
// qué producto es la caja física que acaba de abrir.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "importaciones", "/importaciones/recepcion");
  if (!guard.ok) return guard.response;

  const { codigo } = await req.json() as { codigo?: string };
  if (!codigo?.trim()) return NextResponse.json({ error: "Falta el código escaneado" }, { status: 400 });

  await initImportacionesTables();
  const desglose = await resolverEscaneoRecepcion(codigo.trim());
  if (!desglose) return NextResponse.json({ error: "No encontramos ninguna compra con ese tracking." }, { status: 404 });
  return NextResponse.json(desglose);
}
