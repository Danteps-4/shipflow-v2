import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const state = session?.sub ?? "unknown";

  const clientId    = process.env.TN_CLIENT_ID;
  const redirectUri = process.env.TN_REDIRECT_URI;

  const authUrl =
    `https://www.tiendanube.com/apps/${clientId}/authorize` +
    `?response_type=code` +
    `&scope=read_orders%20write_orders%20write_fulfillment_orders` +
    `&redirect_uri=${encodeURIComponent(redirectUri!)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(authUrl);
}
