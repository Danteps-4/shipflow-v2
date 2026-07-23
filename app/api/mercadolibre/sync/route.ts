import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getActiveStore } from "@/lib/tnStores";
import { getMlConexionByStoreId } from "@/lib/mlDb";
import { getValidMlAccessToken } from "@/lib/mlTokens";
import { extractDeducirItems, type MlOrder } from "@/lib/mlClient";
import { initStockTables, deducirStock } from "@/lib/stockDb";

export const runtime = "nodejs";

const DIAS_ATRAS = 7;

// Red de seguridad manual: no hay cron/colas en el proyecto, así que si
// un webhook de ML se pierde (caída puntual, red), este endpoint permite
// reconciliar a mano trayendo las ventas pagas recientes. Es inofensivo
// reprocesar pedidos ya descontados por webhook, gracias a la
// idempotencia de deducirStock().
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "mercadolibre", "/mercadolibre");
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

  const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000).toISOString();
  const searchUrl = new URL("https://api.mercadolibre.com/orders/search");
  searchUrl.searchParams.set("seller", conexion.ml_user_id);
  searchUrl.searchParams.set("order.status", "paid");
  searchUrl.searchParams.set("order.date_created.from", desde);
  searchUrl.searchParams.set("sort", "date_desc");

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!searchRes.ok) {
    return NextResponse.json(
      { error: `ML API error: ${searchRes.status}`, detail: await searchRes.text() },
      { status: 502 },
    );
  }

  const { results } = await searchRes.json() as { results: MlOrder[] };

  await initStockTables();
  let lineasProcesadas = 0;
  const insuficiente: unknown[] = [];
  for (const order of results ?? []) {
    const items = await extractDeducirItems(storeId, accessToken, order);
    if (!items.length) continue;
    const r = await deducirStock(storeId, items, "mercadolibre");
    lineasProcesadas += items.length - r.omitidos;
    insuficiente.push(...r.insuficiente);
  }

  return NextResponse.json({
    ok: true,
    ordenes: results?.length ?? 0,
    lineasProcesadas,
    insuficiente,
  });
}
