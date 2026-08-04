import { NextRequest, NextResponse } from "next/server";
import { deleteTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (sfUserId) deleteTokens(sfUserId);
  return NextResponse.json({ ok: true });
}
