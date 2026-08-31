import { TnOrder } from "@/types/orders";
import { OrderCandidate, parseTotalTnACentavos } from "./conciliacionMatching";

function tnHeaders(token: string) {
  return {
    "Authentication": `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "ShipFlow/1.0",
  };
}

function esGatewayTransferencia(order: TnOrder): boolean {
  return order.gateway === "offline" || /transferencia/i.test(order.gateway_name ?? "");
}

function toCandidate(order: TnOrder, storeId: string): OrderCandidate {
  return {
    storeId,
    orderId: String(order.id),
    orderNumber: String(order.number),
    contactName: order.contact_name ?? "",
    contactDni: order.contact_identification ?? null,
    totalCents: parseTotalTnACentavos(order.total),
    isTransferGateway: esGatewayTransferencia(order),
  };
}

// Pedidos pendientes de pago por transferencia en una tienda, acotados a una
// ventana de días reciente (no recorre todo el histórico). Paginado simple.
export async function buscarPedidosPendientesTransferencia(
  storeId: string, accessToken: string, ventanaDias: number,
): Promise<OrderCandidate[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - ventanaDias);

  const candidatos: OrderCandidate[] = [];
  let page = 1;
  const perPage = 50;
  for (;;) {
    const url = new URL(`https://api.tiendanube.com/v1/${storeId}/orders`);
    url.searchParams.set("payment_status", "pending");
    url.searchParams.set("created_at_min", desde.toISOString());
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    const res = await fetch(url.toString(), { headers: tnHeaders(accessToken), cache: "no-store" });
    if (!res.ok) throw new Error(`TN API error: ${res.status}`);
    const orders = await res.json() as TnOrder[];
    for (const o of orders) {
      if (esGatewayTransferencia(o)) candidatos.push(toCandidate(o, storeId));
    }
    if (orders.length < perPage) break;
    page++;
    if (page > 20) break; // salvaguarda — no debería haber tantas páginas de pendientes
  }
  return candidatos;
}

// Busca un pedido por número en una tienda puntual (para vincular a mano
// una transferencia en revisión). Devuelve null si no aparece.
export async function buscarPedidoPorNumero(
  storeId: string, accessToken: string, numeroOrden: string,
): Promise<TnOrder | null> {
  const url = new URL(`https://api.tiendanube.com/v1/${storeId}/orders`);
  url.searchParams.set("q", numeroOrden);
  const res = await fetch(url.toString(), { headers: tnHeaders(accessToken), cache: "no-store" });
  if (!res.ok) throw new Error(`TN API error: ${res.status}`);
  const orders = await res.json() as TnOrder[];
  return orders.find(o => String(o.number) === String(numeroOrden)) ?? null;
}

// Re-consulta un pedido puntual — usado antes de confirmar manualmente
// ("¿ya quedó pagado en Tiendanube?") y para el motor de reintentos.
export async function consultarPedido(
  storeId: string, accessToken: string, orderId: string,
): Promise<TnOrder> {
  const url = `https://api.tiendanube.com/v1/${storeId}/orders/${orderId}`;
  const res = await fetch(url, { headers: tnHeaders(accessToken), cache: "no-store" });
  if (!res.ok) throw new Error(`TN API error: ${res.status}`);
  return await res.json() as TnOrder;
}
