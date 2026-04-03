import { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "./session";

export async function getSessionUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.sub ?? null;
}
