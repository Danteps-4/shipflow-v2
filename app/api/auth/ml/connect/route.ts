import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/getSessionUser";
import { getActiveStore } from "@/lib/tnStores";

export const runtime = "nodejs";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Inicia el flujo OAuth de Mercado Libre (PKCE). La conexión queda atada
// a la tienda de Tienda Nube activa del usuario, que es la partición
// (store_id) que ya usa el módulo de stock.
export async function GET(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.redirect(new URL("/login?error=session_expired", req.url));

  const store = getActiveStore(sfUserId);
  if (!store) return NextResponse.redirect(new URL("/?error=no_tn_store", req.url));

  const codeVerifier   = base64url(crypto.randomBytes(32));
  const codeChallenge  = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

  const authUrl = new URL("https://auth.mercadolibre.com.ar/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", process.env.ML_CLIENT_ID ?? "");
  authUrl.searchParams.set("redirect_uri", process.env.ML_REDIRECT_URI ?? "");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("ml_pkce_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
