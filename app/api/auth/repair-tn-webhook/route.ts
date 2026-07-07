import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/getSessionUser";
import { readTokens } from "@/lib/tnTokens";
import { getActiveStore } from "@/lib/tnStores";
import { initMlTables, upsertTnConexion } from "@/lib/mlDb";
import { registerTnWebhook } from "@/lib/tnWebhooks";

export const runtime = "nodejs";

// Repara conexiones de Tienda Nube que ya existían antes de que se
// agregara el webhook order/paid: usa el access_token ya guardado
// (sin pedir reautorizar OAuth) para completar tn_conexiones y
// registrar el webhook que falta. Visitar una sola vez, logueado.
export async function GET(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tokens = readTokens(sfUserId);
  const store  = getActiveStore(sfUserId);
  if (!tokens || !store) {
    return NextResponse.json({ error: "No hay ninguna tienda de Tienda Nube conectada" }, { status: 400 });
  }

  await initMlTables();
  await upsertTnConexion(String(tokens.user_id), tokens.access_token, store.store_name);
  await registerTnWebhook(tokens.user_id, tokens.access_token);

  return NextResponse.json({ ok: true, store_id: tokens.user_id, store_name: store.store_name });
}
