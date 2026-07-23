import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initFinanzasTables, getCierres, deleteCierre } from "@/lib/finanzasDb";
import { destroyAsset } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/transferencias");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initFinanzasTables();
  const cierres = await getCierres(storeId);
  return NextResponse.json({ cierres });
}

// Body: { id } — borra un cierre entero del historial junto con todas las
// transferencias que quedaron agrupadas ahí (y sus comprobantes en Cloudinary).
export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas/transferencias");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const borrado = await deleteCierre(storeId, Number(id));
  if (!borrado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await Promise.all(borrado.comprobantePublicIds.map(publicId => destroyAsset(publicId, "image").catch(() => {})));
  return NextResponse.json({ ok: true });
}
