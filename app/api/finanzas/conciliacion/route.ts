import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initConciliacionTables, getTransferencias, getKpisHoy, getAutoConfirmEnabled } from "@/lib/conciliacionTransferenciasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No depende de la tienda activa de la sesión — las filas ya traen su
// propio store_id una vez matcheadas (puede haber más de una tienda
// conectada, y una transferencia pertenece a la que sea).
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/conciliacion-transferencias");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  await initConciliacionTables();
  const [transferencias, kpis, autoConfirmEnabled] = await Promise.all([
    getTransferencias({
      estado: sp.get("estado") ?? undefined,
      fechaDesde: sp.get("fecha_desde") ?? undefined,
      fechaHasta: sp.get("fecha_hasta") ?? undefined,
      dni: sp.get("dni") ?? undefined,
      nombre: sp.get("nombre") ?? undefined,
      pedido: sp.get("pedido") ?? undefined,
      transactionId: sp.get("transaction_id") ?? undefined,
    }),
    getKpisHoy(),
    getAutoConfirmEnabled(),
  ]);
  return NextResponse.json({ transferencias, kpis, autoConfirmEnabled });
}
