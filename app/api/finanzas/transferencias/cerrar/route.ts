import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initFinanzasTables, cerrarDiaTransferencias, setPorcentajeFinancieraDefault } from "@/lib/finanzasDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

// Junta todas las transferencias activas en un nuevo cierre (suma el total y
// las saca de la cuenta "de hoy"), y arranca una cuenta nueva en cero.
// Body: { porcentaje } — lo que cobra la financiera sobre el total de ese cierre.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/transferencias");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { porcentaje } = await req.json().catch(() => ({ porcentaje: 0 }));
  const porcentajeNum = Number(porcentaje) || 0;
  if (porcentajeNum < 0 || porcentajeNum > 100) {
    return NextResponse.json({ error: "Porcentaje inválido" }, { status: 400 });
  }

  await initFinanzasTables();
  const cierre = await cerrarDiaTransferencias(storeId, guard.user.name, porcentajeNum);
  if (!cierre) return NextResponse.json({ error: "No hay transferencias para cerrar" }, { status: 400 });
  await setPorcentajeFinancieraDefault(storeId, porcentajeNum);
  return NextResponse.json({ cierre });
}
