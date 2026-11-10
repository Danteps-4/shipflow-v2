import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { sincronizarRetirosDesdeTn } from "@/lib/retirosAuto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sincronización manual (botón "Sincronizar con Tienda Nube"): ignora el
// freno de 2 minutos de la automática.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard.response;

  const sfUserId = await getSessionUserId(req);
  const tokens = sfUserId ? readTokens(sfUserId) : null;
  if (!tokens) return NextResponse.json({ error: "Tienda Nube no está conectado" }, { status: 400 });

  try {
    const resultado = await sincronizarRetirosDesdeTn(String(tokens.user_id), tokens.access_token, true);
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al sincronizar" }, { status: 502 });
  }
}
