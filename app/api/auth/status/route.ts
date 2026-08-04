import { NextRequest, NextResponse } from "next/server";
import { getStoresStateForUser } from "@/lib/tnStores";
import { getSessionUserId } from "@/lib/getSessionUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ connected: false, active: null, stores: [] });

  const state = getStoresStateForUser(sfUserId);
  const { active, stores } = state;
  return NextResponse.json({
    connected: active !== null,
    active,
    store_id: active,
    stores: stores.map((s) => ({
      user_id:      s.user_id,
      store_name:   s.store_name,
      connected_at: s.connected_at,
    })),
  });
}
