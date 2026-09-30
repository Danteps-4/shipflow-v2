import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initFinanzasTables, reorderCategoriasGastoNegocio } from "@/lib/finanzasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body: { ids: number[] } — el orden del array es el orden final que van a
// quedar las categorías (se usa desde los botones subir/bajar del modal).
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number")) {
    return NextResponse.json({ error: "Falta el array de ids" }, { status: 400 });
  }

  await initFinanzasTables();
  await reorderCategoriasGastoNegocio(ids);
  return NextResponse.json({ ok: true });
}
