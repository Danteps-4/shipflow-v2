import { NextRequest, NextResponse } from "next/server";
import { switchStore } from "@/lib/tnStores";
import { getSessionUserId } from "@/lib/getSessionUser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { storeId } = await req.json();
  const ok = switchStore(sfUserId, Number(storeId));
  if (!ok) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
