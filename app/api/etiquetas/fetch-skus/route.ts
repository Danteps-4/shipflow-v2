import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { requireModule } from "@/lib/permissions";

export const runtime = "nodejs";

interface TnProduct {
  name: string;
  sku: string | null;
  quantity: number;
}

interface TnOrderRaw {
  number: number;
  contact_name: string;
  products: TnProduct[];
  shipping_address?: { name?: string } | null;
}

function tnHeaders(token: string) {
  return {
    "Authentication": `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "ShipFlow/1.0",
  };
}

async function fetchOrderByNumber(
  userId: number,
  token: string,
  orderNumber: string,
): Promise<TnOrderRaw | null> {
  const url = `https://api.tiendanube.com/v1/${userId}/orders?q=${encodeURIComponent(orderNumber)}&per_page=5`;
  try {
    const res = await fetch(url, { headers: tnHeaders(token), cache: "no-store" });
    if (!res.ok) return null;
    const list: TnOrderRaw[] = await res.json();
    return list.find(o => o.number === parseInt(orderNumber, 10)) ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const tokens = readTokens();
  if (!tokens) return NextResponse.json({ error: "No hay tienda conectada" }, { status: 401 });

  const body = await req.json() as { orderNumbers?: string[] };
  const orderNumbers = body.orderNumbers ?? [];
  if (!orderNumbers.length) return NextResponse.json({ orders: {} });

  const BATCH = 5;
  const result: Record<string, { nombre: string; skus: { sku: string; cantidad: number }[] }> = {};

  for (let i = 0; i < orderNumbers.length; i += BATCH) {
    const batch   = orderNumbers.slice(i, i + BATCH);
    const settled = await Promise.all(
      batch.map(num => fetchOrderByNumber(tokens.user_id, tokens.access_token, num))
    );

    for (let j = 0; j < batch.length; j++) {
      const order = settled[j];
      if (!order) continue;

      const nombre = order.shipping_address?.name ?? order.contact_name ?? "";
      const skus = order.products
        .map(p => ({ sku: (p.sku ?? p.name ?? "").trim(), cantidad: p.quantity }))
        .filter(s => s.sku);

      if (skus.length > 0) result[batch[j]] = { nombre, skus };
    }

    // Respect TN rate limits between batches
    if (i + BATCH < orderNumbers.length) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  return NextResponse.json({ orders: result });
}
