import { NextRequest, NextResponse } from "next/server";
import { addStore } from "@/lib/tnStores";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initMlTables, upsertTnConexion } from "@/lib/mlDb";
import { registerTnWebhook } from "@/lib/tnWebhooks";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get("code");
  const sfUserId = await getSessionUserId(req);

  console.log("[callback] code:", !!code, "sfUserId from session:", sfUserId);

  if (!code)     return NextResponse.redirect(new URL("/?error=missing_code", req.url));
  if (!sfUserId) return NextResponse.redirect(new URL("/login?error=session_expired", req.url));

  const tokenRes = await fetch("https://www.tiendanube.com/apps/authorize/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     process.env.TN_CLIENT_ID,
      client_secret: process.env.TN_CLIENT_SECRET,
      grant_type:    "authorization_code",
      code,
      redirect_uri:  process.env.TN_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    console.error("TN token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }

  const { access_token, user_id } = await tokenRes.json();

  let store_name = `Tienda ${user_id}`;
  try {
    const storeRes = await fetch(`https://api.tiendanube.com/v1/${user_id}/store`, {
      headers: { "Authentication": `bearer ${access_token}`, "User-Agent": "ShipFlow/1.0" },
    });
    if (storeRes.ok) {
      const storeData = await storeRes.json();
      const name = storeData.name;
      if (name) {
        store_name = typeof name === "string" ? name : (name.es ?? name.pt ?? Object.values(name)[0] ?? store_name);
      }
    }
  } catch { /* keep default name */ }

  addStore({ access_token, user_id, store_name, connected_at: new Date().toISOString() });
  console.log("[callback] store saved for sfUserId:", sfUserId, "tn user_id:", user_id);

  // Índice inverso store_id → access_token, para que los webhooks de TN
  // (que llegan sin sesión de navegador) puedan resolver credenciales.
  try {
    await initMlTables();
    await upsertTnConexion(String(user_id), access_token, store_name);
    await registerTnWebhook(user_id, access_token);
  } catch (e) {
    console.error("[callback] error guardando tn_conexiones / webhook:", e);
  }

  // Use TN_REDIRECT_URI to derive the public base URL (avoids Railway's internal localhost:8080)
  const base = process.env.TN_REDIRECT_URI
    ? new URL(process.env.TN_REDIRECT_URI).origin
    : new URL(req.url).origin;
  return NextResponse.redirect(new URL("/orders", base));
}
