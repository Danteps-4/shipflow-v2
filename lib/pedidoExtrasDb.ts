import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PedidoExtra {
  id: number;
  numero_orden: string;
  sku: string;
  cantidad: number;
  nota: string;
  created_at: string;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initPedidoExtrasTables(): Promise<void> {
  const sql = getDb();

  // Líneas de producto agregadas a mano a un pedido (ej: un accesorio que el
  // cliente pidió sumar después de comprar), para que se recuerden solas la
  // próxima vez que se generen las etiquetas de ese pedido, sin depender de
  // que alguien se acuerde de agregarlas en el momento.
  await sql`
    CREATE TABLE IF NOT EXISTS pedido_extras (
      id           SERIAL PRIMARY KEY,
      store_id     TEXT NOT NULL,
      numero_orden TEXT NOT NULL,
      sku          TEXT NOT NULL,
      cantidad     INTEGER NOT NULL DEFAULT 1,
      nota         TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS pedido_extras_store_orden
    ON pedido_extras (store_id, numero_orden)
  `;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getExtrasPorOrden(storeId: string, numeroOrden: string): Promise<PedidoExtra[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, numero_orden, sku, cantidad, nota, created_at
    FROM pedido_extras
    WHERE store_id = ${storeId} AND numero_orden = ${numeroOrden}
    ORDER BY created_at
  `;
  return rows as PedidoExtra[];
}

export async function getExtrasPorOrdenes(
  storeId: string, numerosOrden: string[],
): Promise<Record<string, PedidoExtra[]>> {
  if (!numerosOrden.length) return {};
  const sql = getDb();
  const rows = await sql`
    SELECT id, numero_orden, sku, cantidad, nota, created_at
    FROM pedido_extras
    WHERE store_id = ${storeId} AND numero_orden = ANY(${numerosOrden})
    ORDER BY created_at
  ` as PedidoExtra[];

  const result: Record<string, PedidoExtra[]> = {};
  for (const row of rows) {
    if (!result[row.numero_orden]) result[row.numero_orden] = [];
    result[row.numero_orden].push(row);
  }
  return result;
}

export async function createExtra(
  storeId: string, numeroOrden: string, sku: string, cantidad: number, nota: string,
): Promise<PedidoExtra> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO pedido_extras (store_id, numero_orden, sku, cantidad, nota, created_at)
    VALUES (${storeId}, ${numeroOrden}, ${sku}, ${cantidad}, ${nota}, NOW())
    RETURNING id, numero_orden, sku, cantidad, nota, created_at
  ` as PedidoExtra[];
  return rows[0];
}

export async function deleteExtra(storeId: string, id: number): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM pedido_extras WHERE store_id = ${storeId} AND id = ${id}`;
}

// Sincroniza el SKU de un Cambio (módulo Cambios, ver lib/cambiosDb.ts) con
// su línea de pedido_extras, clave "CAMBIO-{id}" — el mismo formato que
// Andreani imprime como "Interno" en la etiqueta y que /api/etiquetas/extract
// ya normaliza al leer el PDF. Así, cuando se genera o corrige el SKU de un
// envío desde un Ticket, la próxima vez que se suba ese PDF de etiquetas en
// /etiquetas ya aparece precargado, sin tener que volver a tipearlo.
// Reemplaza siempre la fila anterior (borra + inserta) en vez de un UPDATE
// parcial: cada Cambio tiene a lo sumo un SKU, no una lista.
export async function setExtraDeCambio(
  storeId: string, cambioId: number, sku: string | null, nota: string,
): Promise<void> {
  const sql = getDb();
  const numeroOrden = `CAMBIO-${cambioId}`;
  await sql`DELETE FROM pedido_extras WHERE store_id = ${storeId} AND numero_orden = ${numeroOrden}`;
  if (sku?.trim()) {
    await sql`
      INSERT INTO pedido_extras (store_id, numero_orden, sku, cantidad, nota, created_at)
      VALUES (${storeId}, ${numeroOrden}, ${sku.trim().toUpperCase()}, 1, ${nota}, NOW())
    `;
  }
}
