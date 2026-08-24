import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

// Registro puramente estadístico del costo de un lote de envíos procesados
// (pedidos normales, no cambios): sirve para calcular el envío promedio a
// fin de mes y ajustar el cálculo de profit en otro software. A propósito
// NO toca gastos_negocio — no es un gasto, es solo un dato de referencia.
export interface CostoEnvio {
  id: number;
  store_id: string;
  fecha: string; // ISO date
  cantidad_envios: number;
  costo_total: number;
  created_by: string;
  created_at: string;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initCostosEnvioTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS costos_envio (
      id              SERIAL PRIMARY KEY,
      store_id        TEXT NOT NULL,
      fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
      cantidad_envios INTEGER NOT NULL,
      costo_total     NUMERIC(12,2) NOT NULL,
      created_by      TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS costos_envio_store_fecha
    ON costos_envio (store_id, fecha DESC)
  `;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function getCostosEnvio(storeId: string, limit = 500): Promise<CostoEnvio[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, store_id, fecha, cantidad_envios, costo_total, created_by, created_at
    FROM costos_envio
    WHERE store_id = ${storeId}
    ORDER BY fecha DESC, id DESC
    LIMIT ${limit}
  `;
  return rows as CostoEnvio[];
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function createCostoEnvio(
  storeId: string,
  data: { cantidadEnvios: number; costoTotal: number; createdBy: string; fecha?: string },
): Promise<CostoEnvio> {
  const sql = getDb();
  const fecha = data.fecha ?? new Date().toISOString().slice(0, 10);
  const rows = await sql`
    INSERT INTO costos_envio (store_id, cantidad_envios, costo_total, created_by, fecha)
    VALUES (${storeId}, ${data.cantidadEnvios}, ${data.costoTotal}, ${data.createdBy}, ${fecha})
    RETURNING *
  ` as CostoEnvio[];
  return rows[0];
}

// Por si se cargó un valor equivocado y hay que corregirlo sin perder el
// registro (a diferencia de borrar y volver a cargar).
export async function updateCostoEnvio(
  storeId: string,
  id: number,
  data: { cantidadEnvios: number; costoTotal: number; fecha: string },
): Promise<CostoEnvio | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE costos_envio
    SET cantidad_envios = ${data.cantidadEnvios}, costo_total = ${data.costoTotal}, fecha = ${data.fecha}
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING *
  ` as CostoEnvio[];
  return rows[0] ?? null;
}

export async function deleteCostoEnvio(storeId: string, id: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM costos_envio
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}
