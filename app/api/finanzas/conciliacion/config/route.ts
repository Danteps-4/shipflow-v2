import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initConciliacionTables, getAutoConfirmEnabled, setAutoConfirmEnabled } from "@/lib/conciliacionTransferenciasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/conciliacion-transferencias");
  if (!guard.ok) return guard.response;

  await initConciliacionTables();
  return NextResponse.json({ autoConfirmEnabled: await getAutoConfirmEnabled() });
}

// Kill switch — solo admins pueden tocarlo. Al apagarlo, la UI deja de
// mostrar los botones de acción (seguir viendo/detectando/matcheando no
// tiene riesgo, actuar sí).
export async function PUT(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/conciliacion-transferencias");
  if (!guard.ok) return guard.response;
  if (guard.user.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede cambiar esto" }, { status: 403 });
  }

  const { enabled } = await req.json();
  await initConciliacionTables();
  await setAutoConfirmEnabled(!!enabled);
  return NextResponse.json({ ok: true, autoConfirmEnabled: !!enabled });
}
