import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import { updateUserAccess } from "@/lib/userStore";
import { isModuleKey } from "@/lib/modules";
import { isValidHref, LinkAction, LINK_ACTIONS } from "@/lib/navGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeLinkActions(input: unknown): Record<string, LinkAction[]> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const result: Record<string, LinkAction[]> = {};
  for (const [href, acciones] of Object.entries(input as Record<string, unknown>)) {
    if (!isValidHref(href) || !Array.isArray(acciones)) continue;
    result[href] = acciones.filter((a): a is LinkAction => LINK_ACTIONS.includes(a));
  }
  return result;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const body = await req.json() as {
    role?: string; modules?: string[]; linkAccess?: string[]; linkActions?: unknown; ticketsPuedeSupervisar?: boolean;
  };
  const role = body.role === "admin" ? "admin" : "member";
  const modules = (body.modules ?? []).filter(isModuleKey);
  const linkAccess = body.linkAccess?.filter(isValidHref);
  const linkActions = sanitizeLinkActions(body.linkActions);
  const ticketsPuedeSupervisar = body.ticketsPuedeSupervisar === true;

  const updated = updateUserAccess(params.id, { role, modules, linkAccess, linkActions, ticketsPuedeSupervisar });
  if (!updated) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  return NextResponse.json({
    user: {
      id: updated.id, name: updated.name, email: updated.email,
      role: updated.role, modules: updated.modules, linkAccess: updated.linkAccess, linkActions: updated.linkActions,
      ticketsPuedeSupervisar: updated.ticketsPuedeSupervisar,
    },
  });
}
