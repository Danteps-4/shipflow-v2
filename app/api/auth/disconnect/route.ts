import { NextRequest, NextResponse } from "next/server";
import { disconnectStore } from "@/lib/tnStores";
import { getSessionUserId } from "@/lib/getSessionUser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { storeId } = await req.json();
  disconnectStore(sfUserId, Number(storeId));
  return NextResponse.json({ ok: true });
}
