import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { requireModule } from "@/lib/permissions";

export const runtime = "nodejs";

// Búsqueda de pedidos de Tienda Nube para el flujo "Crear retiro
// presencial". Guard propio del módulo "retiros" (no reusa el de
// "tickets"/"pedidos": el personal de depósito/atención puede no tener esos
// módulos). Solo Tienda Nube — a diferencia del picker de Tickets, acá no
// hace falta buscar en Mercado Libre.
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard.response;

  const tokens = readTokens(guard.user.id);
  if (!tokens) return NextResponse.json({ error: "Tienda Nube no está conectado" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = sp.get("page") ?? "1";
  const per_page = sp.get("per_page") ?? "8";

  const upstream = new URL(`https://api.tiendanube.com/v1/${tokens.user_id}/orders`);
  upstream.searchParams.set("page", page);
  upstream.searchParams.set("per_page", per_page);
  if (q) upstream.searchParams.set("q", q);

  const tnRes = await fetch(upstream.toString(), {
    headers: { "Authentication": `bearer ${tokens.access_token}`, "Content-Type": "application/json", "User-Agent": "ShipFlow/1.0" },
    cache: "no-store",
  });
  if (!tnRes.ok) return NextResponse.json({ error: `TN API error: ${tnRes.status}`, detail: await tnRes.text() }, { status: tnRes.status });

  const orders = await tnRes.json();
  const total = parseInt(tnRes.headers.get("X-Total-Count") ?? "0", 10);
  return NextResponse.json({ orders, total });
}
