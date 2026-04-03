import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { name: session.name, email: session.email } });
}
