import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/getSessionUser";
import { getActiveStore } from "@/lib/tnStores";
import { deleteMlConexion } from "@/lib/mlDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const store = getActiveStore(sfUserId);
  if (!store) return NextResponse.json({ error: "Sin tienda activa" }, { status: 400 });

  await deleteMlConexion(String(store.user_id));
  return NextResponse.json({ ok: true });
}
