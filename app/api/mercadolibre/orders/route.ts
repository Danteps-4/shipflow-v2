import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getActiveStore } from "@/lib/tnStores";
import { getMlConexionByStoreId } from "@/lib/mlDb";
import { getValidMlAccessToken } from "@/lib/mlTokens";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "mercadolibre", "/mercadolibre/pedidos");
  if (!guard.ok) return guard.response;

  const store = getActiveStore();
  if (!store) return NextResponse.json({ error: "Sin tienda activa" }, { status: 400 });
  const storeId = String(store.user_id);

  const conexion = await getMlConexionByStoreId(storeId);
  if (!conexion) return NextResponse.json({ error: "Mercado Libre no está conectado" }, { status: 400 });

  const accessToken = await getValidMlAccessToken(storeId);
  if (!accessToken) {
    return NextResponse.json({ error: "No se pudo renovar el token de Mercado Libre" }, { status: 502 });
  }

  const sp     = req.nextUrl.searchParams;
  const offset = sp.get("offset") ?? "0";
  const limit  = sp.get("limit")  ?? "20";
  const status = sp.get("status") ?? "";

  const upstream = new URL("https://api.mercadolibre.com/orders/search");
  upstream.searchParams.set("seller", conexion.ml_user_id);
  upstream.searchParams.set("sort", "date_desc");
  upstream.searchParams.set("offset", offset);
  upstream.searchParams.set("limit", limit);
  if (status) upstream.searchParams.set("order.status", status);

  const res = await fetch(upstream.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `ML API error: ${res.status}`, detail: await res.text() },
      { status: 502 },
    );
  }

  const data = await res.json();
  return NextResponse.json({ orders: data.results ?? [], total: data.paging?.total ?? 0 });
}
