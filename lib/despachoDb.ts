import { getDb } from "./db";
import { getTnConexion } from "./mlDb";
import { getCambioById, initCambiosTables } from "./cambiosDb";
import { getTicketsByNumeroPedido, getTicketById, initTicketsTables } from "./ticketsDb";
import { convertTnOrders } from "./convertTnOrders";
import { deducirStock, getStockPorSkus, initStockTables, DeducirItem } from "./stockDb";
import type { TnOrder, ProductoOrden } from "@/types/orders";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const DEFAULT_CARRIER = "andreani";

export type OrigenPedido = "tienda_nube" | "cambio" | "ticket";
export type EstadoScan = "success" | "error";

export type ErrorCodeScan =
  | "NOT_FOUND"
  | "ORDER_LOOKUP_FAILED"
  | "CANCELLED"
  | "PAYMENT_NOT_CONFIRMED"
  | "NO_PRODUCTS"
  | "ALREADY_DISPATCHED";

export interface EnvioTracking {
  id: number;
  store_id: string;
  numero_orden: string;
  tracking_number: string;
  carrier: string;
  created_by: string;
  created_at: string;
}

// Shape unificado sin importar de qué rama vino (tienda_nube / cambio / ticket).
export interface PedidoParaEscaneo {
  origenTipo: OrigenPedido;
  storeId: string;
  storeName?: string;
  numeroOrden: string;
  clienteNombre: string;
  medioEnvio: string;
  productos: ProductoOrden[];
  cancelado: boolean;
  pagoConfirmado: boolean; // siempre true para "cambio"/"ticket": no aplica esa validación
}

export interface DispatchScan {
  id: number;
  tracking_number: string;
  carrier: string;
  store_id: string | null;
  numero_orden: string | null;
  origen_tipo: OrigenPedido | null;
  status: EstadoScan;
  error_code: ErrorCodeScan | null;
  error_message: string | null;
  cliente_nombre: string | null;
  metadata: Record<string, unknown>;
  scanned_by: string;
  created_at: string;
}

export type ScanOutcome =
  | {
      ok: true;
      scan: DispatchScan;
      pedido: PedidoParaEscaneo;
      stock: { sku: string; nombre: string; cantidad: number }[];
    }
  | {
      ok: false;
      errorCode: ErrorCodeScan;
      message: string;
      scan: DispatchScan;
      pedido?: PedidoParaEscaneo;
      // Solo presente en ALREADY_DISPATCHED.
      primerEscaneo?: { scannedBy: string; createdAt: string };
    };

const ERROR_MESSAGES: Record<ErrorCodeScan, string> = {
  NOT_FOUND:              "No encontramos ningún pedido asociado a este código.",
  ORDER_LOOKUP_FAILED:    "El código está registrado pero no pudimos recuperar los datos del pedido.",
  CANCELLED:              "Este paquete no debe salir del depósito.",
  PAYMENT_NOT_CONFIRMED:  "Tienda Nube todavía no confirmó el pago de este pedido.",
  NO_PRODUCTS:            "Este pedido no tiene productos asociados.",
  ALREADY_DISPATCHED:     "Este envío fue escaneado anteriormente.",
};

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initDespachoTables(): Promise<void> {
  const sql = getDb();

  // Reverse-index tracking_number → pedido. Se llena desde /api/tracking en
  // el mismo momento en que hoy se le manda el tracking a Tienda Nube (ver
  // upsertEnvioTracking) — es lo más parecido que existe en ShipFlow a "se
  // generó la etiqueta", así que created_at también sirve para "etiquetas
  // generadas hoy" en la comparación contra lo efectivamente escaneado.
  await sql`
    CREATE TABLE IF NOT EXISTS envios_tracking (
      id              SERIAL PRIMARY KEY,
      store_id        TEXT NOT NULL,
      numero_orden    TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      carrier         TEXT NOT NULL DEFAULT 'andreani',
      created_by      TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS envios_tracking_carrier_tracking_uidx
    ON envios_tracking (carrier, tracking_number)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS envios_tracking_store_orden_idx
    ON envios_tracking (store_id, numero_orden)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS envios_tracking_created_at_idx
    ON envios_tracking (created_at DESC)
  `;

  // Log de cada intento de escaneo en el puesto de despacho, éxito y error.
  // metadata guarda una foto del pedido en el momento del escaneo (cliente,
  // productos, medio de envío) para que el historial no dependa de volver a
  // pedirle los datos a Tiendanube/Cambios/Tickets después.
  await sql`
    CREATE TABLE IF NOT EXISTS dispatch_scans (
      id              SERIAL PRIMARY KEY,
      tracking_number TEXT NOT NULL,
      carrier         TEXT NOT NULL DEFAULT 'andreani',
      store_id        TEXT,
      numero_orden    TEXT,
      origen_tipo     TEXT,
      status          TEXT NOT NULL CHECK (status IN ('success', 'error')),
      error_code      TEXT,
      error_message   TEXT,
      cliente_nombre  TEXT,
      metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
      scanned_by      TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Único índice que garantiza "un mismo paquete no se puede despachar dos
  // veces", pero solo entre filas EXITOSAS — los intentos con error (incluido
  // el que justamente detecta el duplicado) no compiten por este índice, así
  // que se pueden loguear todos sin choque. Es la base del claim atómico de
  // registrarEscaneoExitoso: dos requests simultáneos para el mismo tracking
  // nunca pueden insertar dos filas 'success' a la vez.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS dispatch_scans_carrier_tracking_success_uidx
    ON dispatch_scans (carrier, tracking_number) WHERE status = 'success'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS dispatch_scans_created_at_idx
    ON dispatch_scans (created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS dispatch_scans_tracking_idx
    ON dispatch_scans (tracking_number)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS dispatch_scans_store_orden_idx
    ON dispatch_scans (store_id, numero_orden)
  `;
}

// ─── envios_tracking ─────────────────────────────────────────────────────────

// Se llama desde /api/tracking apenas se confirma un tracking (por cualquiera
// de sus 3 caminos: Cambio, pedido real de TN, o pedido vinculado a un
// Ticket). No pisa created_at en un conflicto para no correr hacia adelante
// la fecha de "etiqueta generada" si el mismo tracking se vuelve a cargar.
export async function upsertEnvioTracking(data: {
  storeId: string;
  numeroOrden: string;
  trackingNumber: string;
  carrier?: string;
  createdBy: string;
}): Promise<void> {
  const sql = getDb();
  const carrier = data.carrier ?? DEFAULT_CARRIER;
  await sql`
    INSERT INTO envios_tracking (store_id, numero_orden, tracking_number, carrier, created_by)
    VALUES (${data.storeId}, ${data.numeroOrden}, ${data.trackingNumber}, ${carrier}, ${data.createdBy})
    ON CONFLICT (carrier, tracking_number) DO UPDATE SET
      store_id = ${data.storeId}, numero_orden = ${data.numeroOrden}, created_by = ${data.createdBy}
  `;
}

export async function getEnvioTrackingByTracking(
  trackingNumber: string, carrier: string = DEFAULT_CARRIER,
): Promise<EnvioTracking | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM envios_tracking WHERE carrier = ${carrier} AND tracking_number = ${trackingNumber}
  ` as EnvioTracking[];
  return rows[0] ?? null;
}

function rangoDelDia(fecha?: string): { desde: string; hasta: string } {
  const d = fecha ?? new Date().toISOString().slice(0, 10);
  return { desde: d, hasta: d };
}

export async function getEtiquetasGeneradasHoy(fecha?: string): Promise<EnvioTracking[]> {
  const sql = getDb();
  const { desde, hasta } = rangoDelDia(fecha);
  const rows = await sql`
    SELECT * FROM envios_tracking
    WHERE created_at >= ${desde}::date AND created_at < (${hasta}::date + INTERVAL '1 day')
    ORDER BY created_at DESC
  `;
  return rows as EnvioTracking[];
}

// Etiquetas generadas hoy que todavía no tienen un escaneo exitoso.
export async function getPendientesDeEscaneo(fecha?: string): Promise<EnvioTracking[]> {
  const sql = getDb();
  const { desde, hasta } = rangoDelDia(fecha);
  const rows = await sql`
    SELECT et.* FROM envios_tracking et
    LEFT JOIN dispatch_scans ds
      ON ds.carrier = et.carrier AND ds.tracking_number = et.tracking_number AND ds.status = 'success'
    WHERE et.created_at >= ${desde}::date AND et.created_at < (${hasta}::date + INTERVAL '1 day')
      AND ds.id IS NULL
    ORDER BY et.created_at DESC
  `;
  return rows as EnvioTracking[];
}

// ─── Resolución de pedido (numero_orden → datos completos) ──────────────────
// Reusable a futuro por picking/packing: a diferencia de procesarEscaneo, esta
// función no depende de que exista un tracking, solo de (storeId, numeroOrden).

async function fetchTnOrderByNumero(
  accessToken: string, storeIdNumeric: string, numeroOrden: string,
): Promise<TnOrder | null> {
  const url = `https://api.tiendanube.com/v1/${storeIdNumeric}/orders?q=${encodeURIComponent(numeroOrden)}`;
  const res = await fetch(url, {
    headers: { "Authentication": `bearer ${accessToken}`, "User-Agent": "ShipFlow/1.0" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data)) return null;
  return (data as TnOrder[]).find(o => String(o.number) === numeroOrden) ?? null;
}

export async function resolvePedidoPorNumeroOrden(
  storeId: string, numeroOrden: string,
): Promise<PedidoParaEscaneo | null> {
  // Rama 1: envío CAMBIO-{id} (reposición manual, módulo Cambios) — no tiene
  // concepto de cancelación ni de payment_status (no es una venta).
  const cambioMatch = numeroOrden.match(/^CAMBIO-(\d+)$/i);
  if (cambioMatch) {
    await initCambiosTables();
    const cambio = await getCambioById(storeId, Number(cambioMatch[1]));
    if (!cambio) return null;
    return {
      origenTipo: "cambio",
      storeId,
      numeroOrden,
      clienteNombre: cambio.nombre,
      medioEnvio: cambio.tipo === "sucursal" ? "Punto de retiro" : "Andreani a Domicilio",
      productos: cambio.sku ? [{ sku: cambio.sku, nombre: cambio.sku, cantidad: 1 }] : [],
      cancelado: false,
      pagoConfirmado: true,
    };
  }

  // Rama 2: pedido real de Tienda Nube — se reusa convertTnOrders tal cual
  // para no reimplementar el mapeo cliente/productos/medioEnvio.
  const conexion = await getTnConexion(storeId);
  if (conexion) {
    const tnOrder = await fetchTnOrderByNumero(conexion.access_token, storeId, numeroOrden);
    if (tnOrder) {
      const [grouped] = convertTnOrders([tnOrder]);
      return {
        origenTipo: "tienda_nube",
        storeId,
        storeName: conexion.store_name,
        numeroOrden,
        clienteNombre: grouped.nombreEnvio,
        medioEnvio: grouped.medioEnvio,
        productos: grouped.productos ?? [],
        cancelado: tnOrder.status === "cancelled",
        pagoConfirmado: tnOrder.payment_status === "paid",
      };
    }
  }

  // Rama 3: pedido vinculado solo a un Ticket de Soporte (ej. cargado a mano
  // directo en Andreani por un dato faltante) — sin status/payment_status
  // confiables en vivo, así que esas dos validaciones no aplican acá.
  await initTicketsTables();
  const tickets = await getTicketsByNumeroPedido(storeId, numeroOrden);
  if (tickets.length > 0) {
    const ticket = await getTicketById(storeId, tickets[0].id);
    if (ticket) {
      return {
        origenTipo: "ticket",
        storeId,
        numeroOrden,
        clienteNombre: ticket.cliente_nombre,
        medioEnvio: ticket.pedido_transportista ?? "Andreani",
        productos: (ticket.pedido_productos_json ?? []).map(p => ({
          sku: p.sku ?? "", nombre: p.nombre, cantidad: p.cantidad,
        })),
        cancelado: false,
        pagoConfirmado: true,
      };
    }
  }

  return null;
}

// ─── Escaneo ───────────────────────────────────────────────────────────────

export async function registrarEscaneoExitoso(data: {
  trackingNumber: string;
  carrier: string;
  storeId: string;
  numeroOrden: string;
  origenTipo: OrigenPedido;
  clienteNombre: string;
  metadata: Record<string, unknown>;
  scannedBy: string;
}): Promise<{ claimed: true; scan: DispatchScan } | { claimed: false; existing: DispatchScan }> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO dispatch_scans (
      tracking_number, carrier, store_id, numero_orden, origen_tipo,
      status, cliente_nombre, metadata, scanned_by
    )
    VALUES (
      ${data.trackingNumber}, ${data.carrier}, ${data.storeId}, ${data.numeroOrden}, ${data.origenTipo},
      'success', ${data.clienteNombre}, ${JSON.stringify(data.metadata)}::jsonb, ${data.scannedBy}
    )
    ON CONFLICT (carrier, tracking_number) WHERE status = 'success' DO NOTHING
    RETURNING *
  ` as DispatchScan[];

  if (rows[0]) return { claimed: true, scan: rows[0] };

  const existentes = await sql`
    SELECT * FROM dispatch_scans
    WHERE carrier = ${data.carrier} AND tracking_number = ${data.trackingNumber} AND status = 'success'
    ORDER BY created_at ASC LIMIT 1
  ` as DispatchScan[];
  return { claimed: false, existing: existentes[0] };
}

export async function registrarEscaneoError(data: {
  trackingNumber: string;
  carrier: string;
  storeId?: string | null;
  numeroOrden?: string | null;
  origenTipo?: OrigenPedido | null;
  errorCode: ErrorCodeScan;
  errorMessage: string;
  clienteNombre?: string | null;
  metadata?: Record<string, unknown>;
  scannedBy: string;
}): Promise<DispatchScan> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO dispatch_scans (
      tracking_number, carrier, store_id, numero_orden, origen_tipo,
      status, error_code, error_message, cliente_nombre, metadata, scanned_by
    )
    VALUES (
      ${data.trackingNumber}, ${data.carrier}, ${data.storeId ?? null}, ${data.numeroOrden ?? null}, ${data.origenTipo ?? null},
      'error', ${data.errorCode}, ${data.errorMessage}, ${data.clienteNombre ?? null},
      ${JSON.stringify(data.metadata ?? {})}::jsonb, ${data.scannedBy}
    )
    RETURNING *
  ` as DispatchScan[];
  return rows[0];
}

// Orquestador único, llamado desde app/api/despacho/scan/route.ts. Encapsula
// toda la validación, resolución del pedido, y el claim atómico anti-doble-
// despacho.
export async function procesarEscaneo(codigoRaw: string, scannedBy: string): Promise<ScanOutcome> {
  const codigo = codigoRaw.trim();
  const carrier = DEFAULT_CARRIER;

  const envio = await getEnvioTrackingByTracking(codigo, carrier);
  if (!envio) {
    const scan = await registrarEscaneoError({
      trackingNumber: codigo, carrier, errorCode: "NOT_FOUND",
      errorMessage: ERROR_MESSAGES.NOT_FOUND, scannedBy,
    });
    return { ok: false, errorCode: "NOT_FOUND", message: ERROR_MESSAGES.NOT_FOUND, scan };
  }

  // Chequeo temprano (evita trabajo de más si ya se sabe que está despachado);
  // la garantía real contra la carrera de concurrencia está en el claim
  // atómico del paso final, no acá.
  const yaDespachado = await getDb()`
    SELECT * FROM dispatch_scans
    WHERE carrier = ${carrier} AND tracking_number = ${codigo} AND status = 'success'
    ORDER BY created_at ASC LIMIT 1
  ` as DispatchScan[];
  if (yaDespachado[0]) {
    const scan = await registrarEscaneoError({
      trackingNumber: codigo, carrier, storeId: envio.store_id, numeroOrden: envio.numero_orden,
      errorCode: "ALREADY_DISPATCHED", errorMessage: ERROR_MESSAGES.ALREADY_DISPATCHED, scannedBy,
    });
    return {
      ok: false, errorCode: "ALREADY_DISPATCHED", message: ERROR_MESSAGES.ALREADY_DISPATCHED, scan,
      primerEscaneo: { scannedBy: yaDespachado[0].scanned_by, createdAt: yaDespachado[0].created_at },
    };
  }

  const pedido = await resolvePedidoPorNumeroOrden(envio.store_id, envio.numero_orden);
  if (!pedido) {
    const scan = await registrarEscaneoError({
      trackingNumber: codigo, carrier, storeId: envio.store_id, numeroOrden: envio.numero_orden,
      errorCode: "ORDER_LOOKUP_FAILED", errorMessage: ERROR_MESSAGES.ORDER_LOOKUP_FAILED, scannedBy,
    });
    return { ok: false, errorCode: "ORDER_LOOKUP_FAILED", message: ERROR_MESSAGES.ORDER_LOOKUP_FAILED, scan };
  }

  if (pedido.cancelado) {
    const scan = await registrarEscaneoError({
      trackingNumber: codigo, carrier, storeId: envio.store_id, numeroOrden: envio.numero_orden,
      origenTipo: pedido.origenTipo, errorCode: "CANCELLED", errorMessage: ERROR_MESSAGES.CANCELLED,
      clienteNombre: pedido.clienteNombre, scannedBy,
    });
    return { ok: false, errorCode: "CANCELLED", message: ERROR_MESSAGES.CANCELLED, scan, pedido };
  }

  if (!pedido.pagoConfirmado) {
    const scan = await registrarEscaneoError({
      trackingNumber: codigo, carrier, storeId: envio.store_id, numeroOrden: envio.numero_orden,
      origenTipo: pedido.origenTipo, errorCode: "PAYMENT_NOT_CONFIRMED", errorMessage: ERROR_MESSAGES.PAYMENT_NOT_CONFIRMED,
      clienteNombre: pedido.clienteNombre, scannedBy,
    });
    return { ok: false, errorCode: "PAYMENT_NOT_CONFIRMED", message: ERROR_MESSAGES.PAYMENT_NOT_CONFIRMED, scan, pedido };
  }

  if (pedido.productos.length === 0) {
    const scan = await registrarEscaneoError({
      trackingNumber: codigo, carrier, storeId: envio.store_id, numeroOrden: envio.numero_orden,
      origenTipo: pedido.origenTipo, errorCode: "NO_PRODUCTS", errorMessage: ERROR_MESSAGES.NO_PRODUCTS,
      clienteNombre: pedido.clienteNombre, scannedBy,
    });
    return { ok: false, errorCode: "NO_PRODUCTS", message: ERROR_MESSAGES.NO_PRODUCTS, scan, pedido };
  }

  const claim = await registrarEscaneoExitoso({
    trackingNumber: codigo, carrier, storeId: envio.store_id, numeroOrden: envio.numero_orden,
    origenTipo: pedido.origenTipo, clienteNombre: pedido.clienteNombre,
    metadata: { productos: pedido.productos, medioEnvio: pedido.medioEnvio, storeName: pedido.storeName ?? null },
    scannedBy,
  });

  if (!claim.claimed) {
    // Perdió la carrera contra otro escaneo simultáneo del mismo tracking.
    const scan = await registrarEscaneoError({
      trackingNumber: codigo, carrier, storeId: envio.store_id, numeroOrden: envio.numero_orden,
      origenTipo: pedido.origenTipo, errorCode: "ALREADY_DISPATCHED", errorMessage: ERROR_MESSAGES.ALREADY_DISPATCHED,
      clienteNombre: pedido.clienteNombre, scannedBy,
    });
    return {
      ok: false, errorCode: "ALREADY_DISPATCHED", message: ERROR_MESSAGES.ALREADY_DISPATCHED, scan, pedido,
      primerEscaneo: { scannedBy: claim.existing.scanned_by, createdAt: claim.existing.created_at },
    };
  }

  // El escaneo es el único momento donde ShipFlow descuenta stock: acá es
  // donde el producto físicamente sale del depósito, sin margen de error (a
  // diferencia del pago, que podía descontar stock de un pedido que después
  // se cancelaba o nunca llegaba a despacharse). El pedido YA quedó
  // confirmado como despachado en el paso anterior (el claim atómico) — si
  // el descuento de stock fallara acá, no se revierte el despacho (el
  // paquete ya salió físicamente, es un hecho), solo se loguea el error para
  // revisar el stock a mano.
  try {
    await initStockTables();
    if (pedido.origenTipo === "cambio") {
      const item: DeducirItem = {
        sku: pedido.productos[0].sku, nombre: pedido.productos[0].nombre, cantidad: pedido.productos[0].cantidad,
        motivo: `Despacho Cambio ${envio.numero_orden}`, numeroOrden: envio.numero_orden,
      };
      await deducirStock(envio.store_id, [item], "tiendanube", "ajuste");
    } else {
      const items: DeducirItem[] = pedido.productos.map(p => ({
        sku: p.sku, nombre: p.nombre, cantidad: p.cantidad,
        motivo: `Venta TN #${envio.numero_orden} (despacho)`, numeroOrden: envio.numero_orden,
      }));
      await deducirStock(envio.store_id, items, "tiendanube", "venta");
    }
  } catch (e) {
    console.error("[despacho] error al descontar stock en el escaneo:", e);
  }

  const stock = await getStockPorSkus(envio.store_id, pedido.productos.map(p => p.sku));

  return { ok: true, scan: claim.scan, pedido, stock };
}

// ─── Contadores del día ──────────────────────────────────────────────────────

export interface ContadoresDia {
  total: number;
  exitosos: number;
  errores: number;
  duplicados: number;
  ultimoEscaneo: DispatchScan | null;
}

export async function getContadoresHoy(fecha?: string): Promise<ContadoresDia> {
  const sql = getDb();
  const { desde, hasta } = rangoDelDia(fecha);

  const rows = await sql`
    SELECT status, error_code, COUNT(*)::int AS cantidad
    FROM dispatch_scans
    WHERE created_at >= ${desde}::date AND created_at < (${hasta}::date + INTERVAL '1 day')
    GROUP BY status, error_code
  ` as { status: EstadoScan; error_code: ErrorCodeScan | null; cantidad: number }[];

  let exitosos = 0, errores = 0, duplicados = 0;
  for (const r of rows) {
    if (r.status === "success") exitosos += r.cantidad;
    else if (r.error_code === "ALREADY_DISPATCHED") duplicados += r.cantidad;
    else errores += r.cantidad;
  }

  const ultimo = await sql`
    SELECT * FROM dispatch_scans
    WHERE created_at >= ${desde}::date AND created_at < (${hasta}::date + INTERVAL '1 day')
    ORDER BY created_at DESC LIMIT 1
  ` as DispatchScan[];

  return {
    total: exitosos + errores + duplicados,
    exitosos, errores, duplicados,
    ultimoEscaneo: ultimo[0] ?? null,
  };
}

// ─── Historial filtrable ──────────────────────────────────────────────────────

export interface HistorialFiltros {
  q?: string;
  numeroOrden?: string;
  tracking?: string;
  scannedBy?: string;
  status?: EstadoScan;
  carrier?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}

export async function getHistorialEscaneos(filtros: HistorialFiltros): Promise<DispatchScan[]> {
  const sql = getDb();
  const limit = filtros.limit ?? 200;
  const rows = await sql`
    SELECT * FROM dispatch_scans
    WHERE (${filtros.q ?? null}::text IS NULL OR (
      numero_orden ILIKE '%' || ${filtros.q ?? null} || '%' OR
      tracking_number ILIKE '%' || ${filtros.q ?? null} || '%' OR
      cliente_nombre ILIKE '%' || ${filtros.q ?? null} || '%'
    ))
    AND (${filtros.numeroOrden ?? null}::text IS NULL OR numero_orden = ${filtros.numeroOrden ?? null})
    AND (${filtros.tracking ?? null}::text IS NULL OR tracking_number = ${filtros.tracking ?? null})
    AND (${filtros.scannedBy ?? null}::text IS NULL OR scanned_by = ${filtros.scannedBy ?? null})
    AND (${filtros.status ?? null}::text IS NULL OR status = ${filtros.status ?? null})
    AND (${filtros.carrier ?? null}::text IS NULL OR carrier = ${filtros.carrier ?? null})
    AND (${filtros.desde ?? null}::date IS NULL OR created_at >= ${filtros.desde ?? null}::date)
    AND (${filtros.hasta ?? null}::date IS NULL OR created_at < (${filtros.hasta ?? null}::date + INTERVAL '1 day'))
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as DispatchScan[];
}
