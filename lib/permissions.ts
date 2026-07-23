import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "./getSessionUser";
import { findUserById, User } from "./userStore";
import { ModuleKey } from "./modules";
import { hasLinkAccess } from "./navGroups";

export async function getCurrentUser(req: NextRequest): Promise<User | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  return findUserById(sfUserId);
}

type Guard =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

// href opcional: si se pasa, además de tener el módulo, el usuario tiene
// que tener acceso a ese sub apartado puntual (ver lib/navGroups.ts).
export async function requireModule(req: NextRequest, moduleKey: ModuleKey, href?: string): Promise<Guard> {
  const user = await getCurrentUser(req);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (user.role !== "admin") {
    if (!user.modules.includes(moduleKey)) {
      return { ok: false, response: NextResponse.json({ error: "No tenés acceso a este módulo" }, { status: 403 }) };
    }
    if (href && !hasLinkAccess(user.linkAccess, href)) {
      return { ok: false, response: NextResponse.json({ error: "No tenés acceso a esta sección" }, { status: 403 }) };
    }
  }
  return { ok: true, user };
}

export async function requireAdmin(req: NextRequest): Promise<Guard> {
  const user = await getCurrentUser(req);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 }) };
  }
  return { ok: true, user };
}
