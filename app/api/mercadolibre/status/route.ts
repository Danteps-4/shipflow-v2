import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/getSessionUser";
import { getActiveStore } from "@/lib/tnStores";
import { getMlConexionByStoreId } from "@/lib/mlDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const store = getActiveStore(sfUserId);
  if (!store) return NextResponse.json({ connected: false, noTnStore: true });

  const conexion = await getMlConexionByStoreId(String(store.user_id));
  if (!conexion) return NextResponse.json({ connected: false });

  return NextResponse.json({ connected: true, nickname: conexion.nickname });
}
