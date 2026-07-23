import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getActiveStore } from "@/lib/tnStores";
import { getMlConexionByStoreId } from "@/lib/mlDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "mercadolibre", "/mercadolibre");
  if (!guard.ok) return guard.response;

  const store = getActiveStore();
  if (!store) return NextResponse.json({ connected: false, noTnStore: true });

  const conexion = await getMlConexionByStoreId(String(store.user_id));
  if (!conexion) return NextResponse.json({ connected: false });

  return NextResponse.json({ connected: true, nickname: conexion.nickname });
}
