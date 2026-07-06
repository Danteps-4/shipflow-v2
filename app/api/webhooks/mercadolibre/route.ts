import { NextRequest, NextResponse } from "next/server";
import { getMlConexionByMlUserId } from "@/lib/mlDb";
import { getValidMlAccessToken } from "@/lib/mlTokens";
import { fetchMlOrder, extractDeducirItems } from "@/lib/mlClient";
import { initStockTables, deducirStock } from "@/lib/stockDb";

export const runtime = "nodejs";

// Descuenta stock apenas Mercado Libre notifica una venta paga.
// ML reintenta la notificación si no respondemos 200, y puede
// reenviarla más de una vez: deducirStock() ya es idempotente por
// (store_id, canal, numeroOrden, sku), así que reprocesar es seguro.
export async function POST(req: NextRequest) {
  let payload: { resource?: string; topic?: string; user_id?: number | string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (payload.topic && payload.topic !== "orders_v2" && payload.topic !== "orders") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mlUserId = payload.user_id ? String(payload.user_id) : null;
  const resource = payload.resource;
  if (!mlUserId || !resource) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const conexion = await getMlConexionByMlUserId(mlUserId);
    if (!conexion) {
      console.warn("[webhooks/mercadolibre] sin conexión para ml_user_id:", mlUserId);
      return NextResponse.json({ ok: true, skipped: true });
    }

    const accessToken = await getValidMlAccessToken(conexion.store_id);
    if (!accessToken) {
      console.error("[webhooks/mercadolibre] sin token vigente para store:", conexion.store_id);
      return NextResponse.json({ ok: false }, { status: 502 });
    }

    const orderId = resource.replace("/orders/", "");
    const order    = await fetchMlOrder(accessToken, orderId);

    // Solo descontar ventas ya pagas — la notificación también dispara
    // en otros cambios de estado de la orden.
    if (order.status !== "paid") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const items = await extractDeducirItems(conexion.store_id, accessToken, order);
    if (items.length > 0) {
      await initStockTables();
      await deducirStock(conexion.store_id, items, "mercadolibre");
    }
  } catch (e) {
    console.error("[webhooks/mercadolibre] error procesando webhook:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
