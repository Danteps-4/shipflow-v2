import { NextRequest, NextResponse } from "next/server";
import { disconnectStore } from "@/lib/tnStores";
import { getSessionUserId } from "@/lib/getSessionUser";
import { deleteTnConexion } from "@/lib/mlDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { storeId } = await req.json();
  disconnectStore(Number(storeId));
  try {
    await deleteTnConexion(String(storeId));
  } catch (e) {
    console.error("[disconnect] error borrando tn_conexiones:", e);
  }
  return NextResponse.json({ ok: true });
}
