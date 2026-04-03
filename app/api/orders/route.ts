import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";

export const runtime = "nodejs";

function tnHeaders(token: string) {
  return {
    "Authentication": `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "ShipFlow/1.0",
  };
}

export async function GET(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tokens = readTokens(sfUserId);
  if (!tokens) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp              = req.nextUrl.searchParams;
  const page            = sp.get("page")            ?? "1";
  const per_page        = sp.get("per_page")        ?? "20";
  const payment_status  = sp.get("payment_status")  ?? "";
  const shipping_status = sp.get("shipping_status") ?? "";
  const q               = sp.get("q")               ?? "";

  const upstream = new URL(`https://api.tiendanube.com/v1/${tokens.user_id}/orders`);
  upstream.searchParams.set("page",     page);
  upstream.searchParams.set("per_page", per_page);
  if (payment_status)  upstream.searchParams.set("payment_status",  payment_status);
  if (shipping_status) upstream.searchParams.set("shipping_status", shipping_status);
  if (q)               upstream.searchParams.set("q", q);

  const tnRes = await fetch(upstream.toString(), {
    headers: tnHeaders(tokens.access_token),
    cache: "no-store",
  });

  if (!tnRes.ok) {
    return NextResponse.json(
      { error: `TN API error: ${tnRes.status}`, detail: await tnRes.text() },
      { status: tnRes.status }
    );
  }

  const orders = await tnRes.json();
  const total  = parseInt(tnRes.headers.get("X-Total-Count") ?? "0", 10);
  return NextResponse.json({ orders, total });
}
