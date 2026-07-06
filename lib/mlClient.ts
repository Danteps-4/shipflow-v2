import { getCachedSku, cacheSku } from "./mlDb";
import type { DeducirItem } from "./stockDb";

const ML_API = "https://api.mercadolibre.com";

export interface MlOrderItem {
  quantity: number;
  unit_price?: number;
  item: {
    id: string;
    title: string;
    seller_sku?: string | null;
    variation_id?: number | string | null;
  };
}

export interface MlOrder {
  id: number;
  status: string;
  date_created?: string;
  total_amount?: number;
  currency_id?: string;
  buyer?: { nickname?: string; first_name?: string; last_name?: string };
  order_items: MlOrderItem[];
}

export async function fetchMlOrder(accessToken: string, orderId: string | number): Promise<MlOrder> {
  const res = await fetch(`${ML_API}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`ML orders fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

interface MlItemDetail {
  id: string;
  title: string;
  seller_sku?: string;
  seller_custom_field?: string | null;
  attributes?: { id: string; value_name?: string | null }[];
}

// El SKU del vendedor puede venir como campo directo, como
// seller_custom_field (legado), o como atributo SELLER_SKU.
async function fetchMlItemSku(accessToken: string, itemId: string): Promise<string> {
  const res = await fetch(`${ML_API}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const item = await res.json() as MlItemDetail;
  if (item.seller_sku) return item.seller_sku;
  if (item.seller_custom_field) return item.seller_custom_field;
  const attr = item.attributes?.find((a) => a.id === "SELLER_SKU");
  return attr?.value_name ?? "";
}

export async function resolveSku(
  storeId: string, accessToken: string, itemId: string, variationId: string,
): Promise<string> {
  const cached = await getCachedSku(storeId, itemId, variationId);
  if (cached) return cached;
  const sku = await fetchMlItemSku(accessToken, itemId);
  if (sku) await cacheSku(storeId, itemId, variationId, sku);
  return sku;
}

// Convierte una orden de Mercado Libre en las líneas de descuento que
// espera deducirStock() (mismo formato que ya usa Tienda Nube).
export async function extractDeducirItems(
  storeId: string, accessToken: string, order: MlOrder,
): Promise<DeducirItem[]> {
  const motivo = `Venta ML #${order.id}`;
  const items: DeducirItem[] = [];

  for (const oi of order.order_items) {
    const variationId = oi.item.variation_id ? String(oi.item.variation_id) : "";
    let sku = oi.item.seller_sku?.trim().toUpperCase() ?? "";
    if (!sku) {
      sku = (await resolveSku(storeId, accessToken, oi.item.id, variationId)).trim().toUpperCase();
    }
    if (!sku) continue; // sin SKU no hay forma de mapear a stock interno

    items.push({
      sku,
      nombre: oi.item.title,
      cantidad: oi.quantity,
      motivo,
      numeroOrden: String(order.id),
    });
  }

  return items;
}
