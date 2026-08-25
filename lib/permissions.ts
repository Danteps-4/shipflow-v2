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

// Para las acciones de Tickets que requieren supervisión (cerrar, sacar de
// "pendiente supervisión", reasignar a otra persona, borrar costos/adjuntos).
// Distinto de requireModule: además de tener el módulo, hace falta el flag
// `ticketsPuedeSupervisar` (o ser admin).
export async function requireTicketsSupervisor(req: NextRequest): Promise<Guard> {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard;
  if (guard.user.role === "admin" || guard.user.ticketsPuedeSupervisar) return guard;
  return { ok: false, response: NextResponse.json({ error: "Requiere permisos de supervisión" }, { status: 403 }) };
}

// Para las acciones de Retiros Presenciales que requieren supervisión
// (cancelar, eliminar, entregar con saldo pendiente sin cobrar).
export async function requireRetirosSupervisor(req: NextRequest): Promise<Guard> {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard;
  if (guard.user.role === "admin" || guard.user.retirosPuedeSupervisar) return guard;
  return { ok: false, response: NextResponse.json({ error: "Requiere permisos de supervisión" }, { status: 403 }) };
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
