import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getActiveStore } from "@/lib/tnStores";
import { initMlTables, upsertMlConexion } from "@/lib/mlDb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code         = req.nextUrl.searchParams.get("code");
  const codeVerifier = req.cookies.get("ml_pkce_verifier")?.value;

  if (!code) return NextResponse.redirect(new URL("/?error=missing_code", req.url));

  const guard = await requireModule(req, "mercadolibre", "/mercadolibre");
  if (!guard.ok) {
    const dest = guard.response.status === 401 ? "/login?error=session_expired" : "/?error=no_access";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  const store = getActiveStore();
  if (!store) return NextResponse.redirect(new URL("/?error=no_tn_store", req.url));
  const storeId = String(store.user_id);

  const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     process.env.ML_CLIENT_ID ?? "",
      client_secret: process.env.ML_CLIENT_SECRET ?? "",
      code,
      redirect_uri:  process.env.ML_REDIRECT_URI ?? "",
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });

  if (!tokenRes.ok) {
    console.error("ML token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/mercadolibre?error=auth_failed", req.url));
  }

  const { access_token, refresh_token, expires_in, user_id } = await tokenRes.json();

  let nickname = `Vendedor ${user_id}`;
  try {
    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      if (me.nickname) nickname = me.nickname;
    }
  } catch { /* keep default */ }

  await initMlTables();
  await upsertMlConexion({
    storeId,
    mlUserId:     String(user_id),
    nickname,
    accessToken:  access_token,
    refreshToken: refresh_token,
    expiresAt:    new Date(Date.now() + expires_in * 1000),
  });

  // A diferencia de Tienda Nube, Mercado Libre no tiene una API para
  // registrar webhooks por conexión: el callback URL y el tópico
  // "orders_v2" se configuran una única vez en el panel de
  // desarrolladores de la app, no hay nada que registrar acá.

  const base = process.env.ML_REDIRECT_URI
    ? new URL(process.env.ML_REDIRECT_URI).origin
    : new URL(req.url).origin;

  const res = NextResponse.redirect(new URL("/mercadolibre", base));
  res.cookies.delete("ml_pkce_verifier");
  return res;
}
