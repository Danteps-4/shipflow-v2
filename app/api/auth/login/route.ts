import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const clientId    = process.env.TN_CLIENT_ID;
  const redirectUri = process.env.TN_REDIRECT_URI;

  const authUrl =
    `https://www.tiendanube.com/apps/${clientId}/authorize` +
    `?response_type=code` +
    `&scope=read_orders%20write_orders%20write_fulfillment_orders` +
    `&redirect_uri=${encodeURIComponent(redirectUri!)}`;

  return NextResponse.redirect(authUrl);
}
