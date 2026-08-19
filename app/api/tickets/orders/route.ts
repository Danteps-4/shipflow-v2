import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { requireModule } from "@/lib/permissions";
import { getActiveStoreForUser } from "@/lib/tnStores";
import { getMlConexionByStoreId } from "@/lib/mlDb";
import { getValidMlAccessToken } from "@/lib/mlTokens";

export const runtime = "nodejs";

// Búsqueda/listado de pedidos para el flujo "Crear Ticket". Guard propio del
// módulo "tickets" (no reusa el de "pedidos"/"mercadolibre": quien atiende
// tickets puede no tener esos módulos). Réplica corta de la lógica de
// /api/orders y /api/mercadolibre/orders, no una llamada a esas rutas.
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const canal = sp.get("canal") ?? "tiendanube";

  if (canal === "mercadolibre") {
    const store = getActiveStoreForUser(guard.user.id);
    if (!store) return NextResponse.json({ error: "Sin tienda activa" }, { status: 400 });
    const storeId = String(store.user_id);

    const conexion = await getMlConexionByStoreId(storeId);
    if (!conexion) return NextResponse.json({ error: "Mercado Libre no está conectado" }, { status: 400 });

    const accessToken = await getValidMlAccessToken(storeId);
    if (!accessToken) return NextResponse.json({ error: "No se pudo renovar el token de Mercado Libre" }, { status: 502 });

    const offset = sp.get("offset") ?? "0";
    const limit = sp.get("limit") ?? "20";

    const upstream = new URL("https://api.mercadolibre.com/orders/search");
    upstream.searchParams.set("seller", conexion.ml_user_id);
    upstream.searchParams.set("sort", "date_desc");
    upstream.searchParams.set("offset", offset);
    upstream.searchParams.set("limit", limit);

    const res = await fetch(upstream.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `ML API error: ${res.status}`, detail: await res.text() }, { status: 502 });

    const data = await res.json();
    return NextResponse.json({ orders: data.results ?? [], total: data.paging?.total ?? 0 });
  }

  // canal === "tiendanube"
  const tokens = readTokens(guard.user.id);
  if (!tokens) return NextResponse.json({ error: "Tienda Nube no está conectado" }, { status: 400 });

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
