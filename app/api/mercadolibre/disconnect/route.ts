import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getActiveStore } from "@/lib/tnStores";
import { deleteMlConexion } from "@/lib/mlDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "mercadolibre", "/mercadolibre");
  if (!guard.ok) return guard.response;

  const store = getActiveStore();
  if (!store) return NextResponse.json({ error: "Sin tienda activa" }, { status: 400 });

  await deleteMlConexion(String(store.user_id));
  return NextResponse.json({ ok: true });
}
