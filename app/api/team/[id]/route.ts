import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import { updateUserAccess } from "@/lib/userStore";
import { isModuleKey } from "@/lib/modules";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const body = await req.json() as { role?: string; modules?: string[] };
  const role = body.role === "admin" ? "admin" : "member";
  const modules = (body.modules ?? []).filter(isModuleKey);

  const updated = updateUserAccess(params.id, { role, modules });
  if (!updated) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  return NextResponse.json({
    user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, modules: updated.modules },
  });
}
