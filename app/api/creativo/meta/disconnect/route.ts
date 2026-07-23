import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getMetaConexion, deleteMetaConexion } from "@/lib/metaDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "creativo", "/creativo");
  if (!guard.ok) return guard.response;

  const conexion = await getMetaConexion();
  if (conexion) await deleteMetaConexion(conexion.ad_account_id);

  return NextResponse.json({ ok: true });
}
