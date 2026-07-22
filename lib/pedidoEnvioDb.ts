import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoEnvio = "domicilio" | "sucursal";

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initPedidoEnvioTables(): Promise<void> {
  const sql = getDb();

  // Override manual de si un pedido va a domicilio o a sucursal, para poder
  // corregir la detección automática (basada en el medio de envío de Tienda
  // Nube) antes de procesar, y que quede recordado para la próxima vez que
  // se genere el Excel de Andreani de ese pedido.
  await sql`
    CREATE TABLE IF NOT EXISTS pedido_envio_overrides (
      id           SERIAL PRIMARY KEY,
      store_id     TEXT NOT NULL,
      numero_orden TEXT NOT NULL,
      tipo         TEXT NOT NULL CHECK (tipo IN ('domicilio','sucursal')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (store_id, numero_orden)
    )
  `;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function getEnvioOverridesPorOrdenes(
  storeId: string, numerosOrden: string[],
): Promise<Record<string, TipoEnvio>> {
  if (!numerosOrden.length) return {};
  const sql = getDb();
  const rows = await sql`
    SELECT numero_orden, tipo
    FROM pedido_envio_overrides
    WHERE store_id = ${storeId} AND numero_orden = ANY(${numerosOrden})
  ` as { numero_orden: string; tipo: TipoEnvio }[];

  const result: Record<string, TipoEnvio> = {};
  for (const row of rows) result[row.numero_orden] = row.tipo;
  return result;
}

// ─── Escritura ───────────────────────────────────────────────────────────────

// tipo = null borra el override (vuelve a la detección automática).
export async function setEnvioOverride(
  storeId: string, numeroOrden: string, tipo: TipoEnvio | null,
): Promise<void> {
  const sql = getDb();
  if (tipo === null) {
    await sql`DELETE FROM pedido_envio_overrides WHERE store_id = ${storeId} AND numero_orden = ${numeroOrden}`;
    return;
  }
  await sql`
    INSERT INTO pedido_envio_overrides (store_id, numero_orden, tipo)
    VALUES (${storeId}, ${numeroOrden}, ${tipo})
    ON CONFLICT (store_id, numero_orden) DO UPDATE SET tipo = ${tipo}
  `;
}
