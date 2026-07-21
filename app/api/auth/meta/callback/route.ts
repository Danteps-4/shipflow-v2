import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initMetaTables, upsertMetaConexion } from "@/lib/metaDb";
import { getAdAccountName } from "@/lib/metaAdsClient";

export const runtime = "nodejs";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("meta_oauth_state")?.value;

  if (!code) return NextResponse.redirect(new URL("/creativo?error=missing_code", req.url));
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/creativo?error=invalid_state", req.url));
  }

  const guard = await requireModule(req, "creativo");
  if (!guard.ok) {
    const dest = guard.response.status === 401 ? "/login?error=session_expired" : "/?error=no_access";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  const adAccountId = process.env.META_AD_ACCOUNT_ID ?? "";
  if (!adAccountId) {
    return NextResponse.redirect(new URL("/creativo?error=no_ad_account_configured", req.url));
  }

  // 1) code → token corto
  const shortUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  shortUrl.searchParams.set("client_secret", process.env.META_APP_SECRET ?? "");
  shortUrl.searchParams.set("redirect_uri", process.env.META_REDIRECT_URI ?? "");
  shortUrl.searchParams.set("code", code);

  const shortRes = await fetch(shortUrl.toString());
  if (!shortRes.ok) {
    console.error("Meta short token exchange failed:", await shortRes.text());
    return NextResponse.redirect(new URL("/creativo?error=auth_failed", req.url));
  }
  const { access_token: shortToken } = await shortRes.json() as { access_token: string };

  // 2) token corto → token largo (~60 días)
  const longUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  longUrl.searchParams.set("client_secret", process.env.META_APP_SECRET ?? "");
  longUrl.searchParams.set("fb_exchange_token", shortToken);

  const longRes = await fetch(longUrl.toString());
  if (!longRes.ok) {
    console.error("Meta long token exchange failed:", await longRes.text());
    return NextResponse.redirect(new URL("/creativo?error=auth_failed", req.url));
  }
  const { access_token: longToken, expires_in } = await longRes.json() as { access_token: string; expires_in: number };

  const nombreCuenta = await getAdAccountName(longToken, adAccountId);

  await initMetaTables();
  await upsertMetaConexion({
    adAccountId,
    nombreCuenta,
    accessToken: longToken,
    tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
  });

  const base = process.env.META_REDIRECT_URI
    ? new URL(process.env.META_REDIRECT_URI).origin
    : new URL(req.url).origin;

  const res = NextResponse.redirect(new URL("/creativo?tab=publicidad", base));
  res.cookies.delete("meta_oauth_state");
  return res;
}
