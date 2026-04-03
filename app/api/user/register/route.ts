import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUser } from "@/lib/userStore";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }
  if (findUserByEmail(email)) {
    return NextResponse.json({ error: "Ya existe una cuenta con ese email" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash });
  const token = await signSession({ sub: user.id, email: user.email, name: user.name });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
