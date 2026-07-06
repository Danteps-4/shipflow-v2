import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getTnConexion } from "@/lib/mlDb";
import { convertTnOrders } from "@/lib/convertTnOrders";
import { initStockTables, deducirStock, DeducirItem } from "@/lib/stockDb";
import type { TnOrder } from "@/types/orders";

export const runtime = "nodejs";

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.TN_CLIENT_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Descuenta stock apenas Tienda Nube confirma el pago de una venta,
// en vez de esperar a que el usuario exporte el pedido a Andreani.
export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
  const signature = req.headers.get("x-linkedstore-hmac-sha256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: { store_id: number; event: string; id: number };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (payload.event !== "order/paid") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const storeId  = String(payload.store_id);
  const conexion = await getTnConexion(storeId);
  if (!conexion) {
    console.warn("[webhooks/tiendanube] sin conexión para store_id:", storeId);
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const orderRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/orders/${payload.id}`, {
      headers: {
        "Authentication": `bearer ${conexion.access_token}`,
        "User-Agent": "ShipFlow/1.0",
      },
      cache: "no-store",
    });
    if (!orderRes.ok) {
      console.error("[webhooks/tiendanube] error fetch order:", orderRes.status, await orderRes.text());
      return NextResponse.json({ ok: false }, { status: 502 });
    }

    const order = await orderRes.json() as TnOrder;
    const [grouped] = convertTnOrders([order]);

    const items: DeducirItem[] = (grouped.productos ?? [])
      .filter((p) => p.sku)
      .map((p) => ({
        sku:         p.sku,
        nombre:      p.nombre,
        cantidad:    p.cantidad,
        motivo:      `Venta TN #${grouped.numeroOrden}`,
        numeroOrden: grouped.numeroOrden,
      }));

    if (items.length > 0) {
      await initStockTables();
      await deducirStock(storeId, items, "tiendanube");
    }
  } catch (e) {
    console.error("[webhooks/tiendanube] error procesando webhook:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
