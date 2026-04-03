import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail } from "@/lib/userStore";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const user = findUserByEmail(email ?? "");
  const valid = user ? await bcrypt.compare(password ?? "", user.passwordHash) : false;

  if (!user || !valid) {
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }

  const token = await signSession({ sub: user.id, email: user.email, name: user.name });

  const res = NextResponse.json({ ok: true, name: user.name });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
