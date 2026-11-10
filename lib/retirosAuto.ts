import { getDb } from "./db";
import { initRetirosTables, createRetiro, ProductoRetiro } from "./retirosDb";
import { initPedidoEnvioTables, getEnvioOverridesPorOrdenes, setEnvioOverride } from "./pedidoEnvioDb";
import { slugify } from "./normalizers";
import type { TnOrder } from "@/types/orders";

// Carga automática de Retiros Presenciales a partir de pedidos de Tienda Nube
// que el cliente va a retirar por el depósito propio.

const TN_API = "https://api.tiendanube.com/v1";
const CREADO_POR = "Tienda Nube (automático)";

// Tienda Nube marca como "pickup" tanto el retiro en nuestro depósito como el
// retiro en una sucursal de Andreani ("Punto de retiro"). Lo que distingue al
// depósito es el nombre de la opción de envío configurada en la tienda
// (hoy "DEPÓSITO") — si se renombra esa opción en Tienda Nube, hay que
// ajustar esto.
const NOMBRE_DEPOSITO = "deposito";

export function esRetiroDeposito(order: Pick<TnOrder, "shipping_pickup_type" | "shipping_option" | "shipping_pickup_details">): boolean {
  if (order.shipping_pickup_type !== "pickup") return false;
  const opcion = typeof order.shipping_option === "string" ? order.shipping_option : order.shipping_option?.name ?? "";
  return [opcion, order.shipping_pickup_details?.name ?? ""].some(n => slugify(n).includes(NOMBRE_DEPOSITO));
}

// Solo pedidos vivos y todavía no retirados: uno cancelado, con el pago
// anulado/reembolsado o ya entregado no tiene nada que preparar.
function esElegible(order: TnOrder): boolean {
  if (order.status !== "open") return false;
  if (["voided", "refunded", "abandoned"].includes(order.payment_status)) return false;
  return order.shipping_status === "unshipped" || order.shipping_status === "unpacked" || order.shipping_status === "packed";
}

let autoInicializado = false;

async function initRetirosAutoTables(): Promise<void> {
  if (autoInicializado) return;
  const sql = getDb();
  await initRetirosTables();
  // Un pedido se carga automáticamente UNA sola vez: si después alguien borra
  // o cancela el retiro, la próxima sincronización no lo vuelve a crear.
  await sql`
    CREATE TABLE IF NOT EXISTS retiros_auto_procesados (
      store_id      TEXT NOT NULL,
      numero_pedido TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, numero_pedido)
    )
  `;
  autoInicializado = true;
}

export type ResultadoPedido = "creado" | "omitido" | "ya_cargado";

// Idempotente y seguro ante llamadas simultáneas (webhook + sincronización):
// el "claim" en retiros_auto_procesados es un INSERT atómico.
export async function cargarRetiroDesdePedido(storeId: string, order: TnOrder): Promise<ResultadoPedido> {
  if (!esRetiroDeposito(order) || !esElegible(order)) return "omitido";

  await initRetirosAutoTables();
  const sql = getDb();
  const numero = String(order.number);

  const claim = await sql`
    INSERT INTO retiros_auto_procesados (store_id, numero_pedido)
    VALUES (${storeId}, ${numero})
    ON CONFLICT DO NOTHING
    RETURNING numero_pedido
  ` as { numero_pedido: string }[];
  if (!claim.length) return "ya_cargado";

  try {
    // Si alguien ya lo cargó a mano en Retiros (en cualquier estado), no se duplica.
    const existente = await sql`
      SELECT 1 AS ya FROM retiros WHERE store_id = ${storeId} AND canal_pedido = 'tiendanube' AND numero_pedido = ${numero} LIMIT 1
    ` as { ya: number }[];
    if (existente.length) return "ya_cargado";

    const productos: ProductoRetiro[] = (order.products ?? []).map(p => ({
      sku: p.sku ? p.sku.trim().toUpperCase() : null,
      nombre: p.variant_name ? `${p.name} - ${p.variant_name}` : p.name,
      cantidad: p.quantity,
      precio: p.price ? Number(p.price) : null,
    }));
    const pagado = order.payment_status === "paid";

    await createRetiro(storeId, {
      canalPedido: "tiendanube",
      numeroPedido: numero,
      pedidoIdInterno: String(order.id),
      pedidoPagadoOriginal: pagado,
      pedidoMetodoEntregaOriginal: `${order.status} · pago: ${order.payment_status} · envío: ${order.shipping_status}`,
      clienteNombre: order.contact_name || order.shipping_address?.name || "",
      clienteTelefono: order.contact_phone || order.shipping_address?.phone || null,
      clienteEmail: order.contact_email || null,
      clienteDni: order.contact_identification || null,
      productos,
      total: Number(order.total) || productos.reduce((s, p) => s + p.cantidad * (p.precio ?? 0), 0),
      estadoPago: pagado ? "pagado" : "pendiente",
      notas: "Cargado automáticamente desde Tienda Nube (retiro por el depósito).",
      createdBy: CREADO_POR,
    });

    // Igual que al vincular un pedido a mano: se marca como retiro presencial
    // para que no entre por error al Excel de Andreani.
    await initPedidoEnvioTables();
    const existentes = await getEnvioOverridesPorOrdenes(storeId, [numero]);
    const actual = existentes[numero] ?? {
      tipo: null, direccion: null, numeroDireccion: null, piso: null,
      localidad: null, provincia: null, codigoPostal: null, sucursal: null,
    };
    await setEnvioOverride(storeId, numero, { ...actual, tipo: "retiro" });
    return "creado";
  } catch (e) {
    // No quedó cargado: se libera el claim para que se reintente.
    await sql`DELETE FROM retiros_auto_procesados WHERE store_id = ${storeId} AND numero_pedido = ${numero}`.catch(() => {});
    throw e;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;
const DIAS_ATRAS = 45;
const POR_PAGINA = 100;
const MAX_PAGINAS = 5;
const ultimaSync = new Map<string, number>();
const enCurso = new Map<string, Promise<ResultadoSync>>();

export interface ResultadoSync {
  creados: number;
  revisados: number;
  omitidaPorFrecuencia?: boolean;
}

// Recorre los pedidos abiertos sin retirar de los últimos días y carga los
// que sean retiro por el depósito. Es el respaldo del webhook (que solo avisa
// pedidos pagados): no hay cron en este proyecto, así que se dispara al abrir
// Retiros — como mucho una vez cada 2 minutos por tienda, salvo `forzar`.
export async function sincronizarRetirosDesdeTn(
  storeId: string, accessToken: string, forzar = false,
): Promise<ResultadoSync> {
  const activa = enCurso.get(storeId);
  if (activa) return activa;
  if (!forzar && Date.now() - (ultimaSync.get(storeId) ?? 0) < SYNC_MIN_INTERVAL_MS) {
    return { creados: 0, revisados: 0, omitidaPorFrecuencia: true };
  }

  const tarea = (async (): Promise<ResultadoSync> => {
    const headers = { "Authentication": `bearer ${accessToken}`, "User-Agent": "ShipFlow/1.0" };
    const desde = new Date(Date.now() - DIAS_ATRAS * 86400000).toISOString();
    let creados = 0;
    let revisados = 0;

    for (const estadoEnvio of ["unpacked", "packed"]) {
      for (let page = 1; page <= MAX_PAGINAS; page++) {
        const url = `${TN_API}/${storeId}/orders?status=open&shipping_status=${estadoEnvio}` +
          `&created_at_min=${encodeURIComponent(desde)}&per_page=${POR_PAGINA}&page=${page}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        // 404 = Tienda Nube responde así cuando no hay resultados en ese filtro.
        if (res.status === 404) break;
        if (!res.ok) throw new Error(`Tienda Nube respondió ${res.status} al listar pedidos`);
        const orders = await res.json() as TnOrder[];
        for (const o of orders) {
          revisados++;
          if (await cargarRetiroDesdePedido(storeId, o) === "creado") creados++;
        }
        if (orders.length < POR_PAGINA) break;
        await sleep(500); // límite de Tienda Nube: ~2 req/s
      }
    }
    ultimaSync.set(storeId, Date.now());
    return { creados, revisados };
  })();

  enCurso.set(storeId, tarea);
  try {
    return await tarea;
  } finally {
    enCurso.delete(storeId);
  }
}

// Para el webhook: trae el pedido por id y lo carga si corresponde.
export async function cargarRetiroDesdePedidoId(
  storeId: string, accessToken: string, orderId: string | number,
): Promise<ResultadoPedido> {
  const res = await fetch(`${TN_API}/${storeId}/orders/${orderId}`, {
    headers: { "Authentication": `bearer ${accessToken}`, "User-Agent": "ShipFlow/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Tienda Nube respondió ${res.status} al traer el pedido ${orderId}`);
  return cargarRetiroDesdePedido(storeId, await res.json() as TnOrder);
}
