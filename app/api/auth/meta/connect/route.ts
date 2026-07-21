import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireModule } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) {
    const dest = guard.response.status === 401 ? "/login?error=session_expired" : "/?error=no_access";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  authUrl.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  authUrl.searchParams.set("redirect_uri", process.env.META_REDIRECT_URI ?? "");
  authUrl.searchParams.set("scope", "ads_read");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
