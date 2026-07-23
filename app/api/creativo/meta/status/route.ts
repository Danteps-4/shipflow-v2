import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initMetaTables, getMetaConexion } from "@/lib/metaDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "creativo", "/creativo");
  if (!guard.ok) return guard.response;

  await initMetaTables();
  const conexion = await getMetaConexion();
  if (!conexion) return NextResponse.json({ connected: false });

  const vigente = new Date(conexion.token_expires_at).getTime() > Date.now();
  return NextResponse.json({
    connected: vigente,
    adAccountId: conexion.ad_account_id,
    nombreCuenta: conexion.nombre_cuenta,
  });
}
