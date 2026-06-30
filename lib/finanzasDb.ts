import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const CATEGORIAS_GASTO = [
  "Operaciones",
  "Marketing",
  "Software",
  "Logística",
  "Impuestos y tasas",
  "Personal",
  "Otros",
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

export interface Gasto {
  id: number;
  store_id: string;
  descripcion: string;
  monto: number;
  categoria: CategoriaGasto;
  fecha: string; // ISO date string YYYY-MM-DD
  created_at: string;
}

export const FRECUENCIAS = ["mensual", "anual"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export interface Suscripcion {
  id: number;
  store_id: string;
  nombre: string;
  monto: number;
  frecuencia: Frecuencia;
  fecha_prox_pago: string; // ISO date
  activa: boolean;
  created_at: string;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initFinanzasTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS gastos (
      id          SERIAL PRIMARY KEY,
      store_id    TEXT    NOT NULL,
      descripcion TEXT    NOT NULL,
      monto       NUMERIC(12,2) NOT NULL,
      categoria   TEXT    NOT NULL DEFAULT 'Otros',
      fecha       DATE    NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gastos_store_fecha
    ON gastos (store_id, fecha DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS suscripciones (
      id               SERIAL PRIMARY KEY,
      store_id         TEXT    NOT NULL,
      nombre           TEXT    NOT NULL,
      monto            NUMERIC(12,2) NOT NULL,
      frecuencia       TEXT    NOT NULL DEFAULT 'mensual',
      fecha_prox_pago  DATE    NOT NULL,
      activa           BOOLEAN NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS suscripciones_store
    ON suscripciones (store_id, activa)
  `;
}

// ─── Gastos ──────────────────────────────────────────────────────────────────

export async function getGastos(
  storeId: string,
  limit = 200,
): Promise<Gasto[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, store_id, descripcion, monto, categoria, fecha, created_at
    FROM gastos
    WHERE store_id = ${storeId}
    ORDER BY fecha DESC, id DESC
    LIMIT ${limit}
  `;
  return rows as Gasto[];
}

export async function createGasto(
  storeId: string,
  descripcion: string,
  monto: number,
  categoria: string,
  fecha: string,
): Promise<Gasto> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO gastos (store_id, descripcion, monto, categoria, fecha)
    VALUES (${storeId}, ${descripcion}, ${monto}, ${categoria}, ${fecha})
    RETURNING *
  ` as Gasto[];
  return rows[0];
}

export async function updateGasto(
  storeId: string,
  id: number,
  descripcion: string,
  monto: number,
  categoria: string,
  fecha: string,
): Promise<Gasto | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE gastos
    SET descripcion = ${descripcion},
        monto       = ${monto},
        categoria   = ${categoria},
        fecha       = ${fecha}
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING *
  ` as Gasto[];
  return rows[0] ?? null;
}

export async function deleteGasto(
  storeId: string,
  id: number,
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM gastos
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}

// ─── Suscripciones ───────────────────────────────────────────────────────────

export async function getSuscripciones(storeId: string): Promise<Suscripcion[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, store_id, nombre, monto, frecuencia, fecha_prox_pago, activa, created_at
    FROM suscripciones
    WHERE store_id = ${storeId}
    ORDER BY activa DESC, fecha_prox_pago ASC
  `;
  return rows as Suscripcion[];
}

export async function createSuscripcion(
  storeId: string,
  nombre: string,
  monto: number,
  frecuencia: string,
  fecha_prox_pago: string,
): Promise<Suscripcion> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO suscripciones (store_id, nombre, monto, frecuencia, fecha_prox_pago)
    VALUES (${storeId}, ${nombre}, ${monto}, ${frecuencia}, ${fecha_prox_pago})
    RETURNING *
  ` as Suscripcion[];
  return rows[0];
}

export async function updateSuscripcion(
  storeId: string,
  id: number,
  nombre: string,
  monto: number,
  frecuencia: string,
  fecha_prox_pago: string,
  activa: boolean,
): Promise<Suscripcion | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE suscripciones
    SET nombre          = ${nombre},
        monto           = ${monto},
        frecuencia      = ${frecuencia},
        fecha_prox_pago = ${fecha_prox_pago},
        activa          = ${activa}
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING *
  ` as Suscripcion[];
  return rows[0] ?? null;
}

export async function deleteSuscripcion(
  storeId: string,
  id: number,
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM suscripciones
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}
