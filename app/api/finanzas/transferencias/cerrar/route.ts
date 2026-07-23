import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initFinanzasTables, cerrarDiaTransferencias } from "@/lib/finanzasDb";

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
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initFinanzasTables();
  const cierre = await cerrarDiaTransferencias(storeId, guard.user.name);
  if (!cierre) return NextResponse.json({ error: "No hay transferencias para cerrar" }, { status: 400 });
  return NextResponse.json({ cierre });
}
