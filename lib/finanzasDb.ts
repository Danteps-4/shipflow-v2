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

export interface Transferencia {
  id: number;
  monto: number;
  comprobante_url: string | null;
  comprobante_public_id: string | null;
  numero_pedido: string | null;
  nombre_pedido: string | null;
  enviada: boolean;
  recibida: boolean;
  cierre_id: number | null;
  created_by: string;
  created_at: string;
}

export interface TransferenciaCierre {
  id: number;
  created_by: string;
  created_at: string;
  cantidad: number;
  total: number;
  enviadas: number;
  recibidas: number;
  porcentaje: number;
  comision: number;
  neto: number;
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

  // Cada "cierre" es el momento en que se cierra el día y se suman todas las
  // transferencias acumuladas hasta ese punto.
  await sql`
    CREATE TABLE IF NOT EXISTS transferencia_cierres (
      id         SERIAL PRIMARY KEY,
      store_id   TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS transferencia_cierres_store
    ON transferencia_cierres (store_id, created_at DESC)
  `;
  // Porcentaje que cobra la financiera sobre el total, fijado al momento de
  // cerrar el día (puede variar de un cierre a otro).
  await sql`
    ALTER TABLE transferencia_cierres ADD COLUMN IF NOT EXISTS porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0
  `;

  // Transferencias recibidas de clientes y desviadas a la cuenta de la
  // financiera. Mientras cierre_id sea NULL, la transferencia está "activa"
  // (todavía no se cerró el día). enviada/recibida se pueden seguir editando
  // después del cierre, porque la financiera confirma en un momento indefinido.
  await sql`
    CREATE TABLE IF NOT EXISTS transferencias (
      id                    SERIAL PRIMARY KEY,
      store_id              TEXT NOT NULL,
      monto                 NUMERIC(12,2) NOT NULL,
      comprobante_url       TEXT,
      comprobante_public_id TEXT,
      enviada               BOOLEAN NOT NULL DEFAULT FALSE,
      recibida              BOOLEAN NOT NULL DEFAULT FALSE,
      cierre_id             INTEGER REFERENCES transferencia_cierres(id) ON DELETE SET NULL,
      created_by            TEXT NOT NULL DEFAULT '',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS transferencias_store_cierre
    ON transferencias (store_id, cierre_id)
  `;
  // Para poder identificar a qué pedido corresponde cada transferencia.
  await sql`ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS numero_pedido TEXT`;
  await sql`ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS nombre_pedido TEXT`;
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

// ─── Transferencias ──────────────────────────────────────────────────────────

// Transferencias todavía no incluidas en ningún cierre (la cuenta "de hoy").
export async function getTransferenciasActivas(storeId: string): Promise<Transferencia[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, monto, comprobante_url, comprobante_public_id, numero_pedido, nombre_pedido, enviada, recibida, cierre_id, created_by, created_at
    FROM transferencias
    WHERE store_id = ${storeId} AND cierre_id IS NULL
    ORDER BY created_at
  `;
  return rows as Transferencia[];
}

export async function getTransferenciasPorCierre(storeId: string, cierreId: number): Promise<Transferencia[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, monto, comprobante_url, comprobante_public_id, numero_pedido, nombre_pedido, enviada, recibida, cierre_id, created_by, created_at
    FROM transferencias
    WHERE store_id = ${storeId} AND cierre_id = ${cierreId}
    ORDER BY created_at
  `;
  return rows as Transferencia[];
}

export async function getTransferenciaById(storeId: string, id: number): Promise<Transferencia | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, monto, comprobante_url, comprobante_public_id, numero_pedido, nombre_pedido, enviada, recibida, cierre_id, created_by, created_at
    FROM transferencias
    WHERE store_id = ${storeId} AND id = ${id}
  ` as Transferencia[];
  return rows[0] ?? null;
}

export async function createTransferencia(
  storeId: string,
  data: {
    monto: number;
    comprobanteUrl: string | null;
    comprobantePublicId: string | null;
    numeroPedido: string | null;
    nombrePedido: string | null;
    enviada: boolean;
    recibida: boolean;
    createdBy: string;
  },
): Promise<Transferencia> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO transferencias (store_id, monto, comprobante_url, comprobante_public_id, numero_pedido, nombre_pedido, enviada, recibida, created_by, created_at)
    VALUES (${storeId}, ${data.monto}, ${data.comprobanteUrl}, ${data.comprobantePublicId}, ${data.numeroPedido}, ${data.nombrePedido}, ${data.enviada}, ${data.recibida}, ${data.createdBy}, NOW())
    RETURNING id, monto, comprobante_url, comprobante_public_id, numero_pedido, nombre_pedido, enviada, recibida, cierre_id, created_by, created_at
  ` as Transferencia[];
  return rows[0];
}

// El caller manda siempre el valor completo de cada campo (no solo el que
// cambió), tomando como base la fila actual.
export async function updateTransferencia(
  storeId: string,
  id: number,
  data: {
    monto?: number;
    comprobanteUrl?: string | null;
    comprobantePublicId?: string | null;
    numeroPedido?: string | null;
    nombrePedido?: string | null;
    enviada?: boolean;
    recibida?: boolean;
  },
): Promise<Transferencia | null> {
  const sql = getDb();
  const actualRows = await sql`
    SELECT monto, comprobante_url, comprobante_public_id, numero_pedido, nombre_pedido, enviada, recibida
    FROM transferencias WHERE store_id = ${storeId} AND id = ${id}
  ` as {
    monto: number; comprobante_url: string | null; comprobante_public_id: string | null;
    numero_pedido: string | null; nombre_pedido: string | null; enviada: boolean; recibida: boolean;
  }[];
  if (!actualRows[0]) return null;
  const current = actualRows[0];

  const monto               = data.monto               ?? current.monto;
  const comprobanteUrl      = data.comprobanteUrl      !== undefined ? data.comprobanteUrl      : current.comprobante_url;
  const comprobantePublicId = data.comprobantePublicId !== undefined ? data.comprobantePublicId : current.comprobante_public_id;
  const numeroPedido        = data.numeroPedido        !== undefined ? data.numeroPedido        : current.numero_pedido;
  const nombrePedido        = data.nombrePedido        !== undefined ? data.nombrePedido        : current.nombre_pedido;
  const enviada              = data.enviada  ?? current.enviada;
  const recibida             = data.recibida ?? current.recibida;

  const rows = await sql`
    UPDATE transferencias
    SET monto = ${monto}, comprobante_url = ${comprobanteUrl}, comprobante_public_id = ${comprobantePublicId},
        numero_pedido = ${numeroPedido}, nombre_pedido = ${nombrePedido}, enviada = ${enviada}, recibida = ${recibida}
    WHERE store_id = ${storeId} AND id = ${id}
    RETURNING id, monto, comprobante_url, comprobante_public_id, numero_pedido, nombre_pedido, enviada, recibida, cierre_id, created_by, created_at
  ` as Transferencia[];
  return rows[0] ?? null;
}

export async function deleteTransferencia(
  storeId: string,
  id: number,
): Promise<{ comprobante_public_id: string | null } | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT comprobante_public_id FROM transferencias WHERE store_id = ${storeId} AND id = ${id}
  ` as { comprobante_public_id: string | null }[];
  if (!rows[0]) return null;
  await sql`DELETE FROM transferencias WHERE store_id = ${storeId} AND id = ${id}`;
  return rows[0];
}

async function getCierreStats(
  storeId: string, cierreId: number,
): Promise<{ cantidad: number; total: number; enviadas: number; recibidas: number }> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS cantidad,
      COALESCE(SUM(monto), 0)::float AS total,
      COUNT(*) FILTER (WHERE enviada)::int AS enviadas,
      COUNT(*) FILTER (WHERE recibida)::int AS recibidas
    FROM transferencias
    WHERE store_id = ${storeId} AND cierre_id = ${cierreId}
  ` as { cantidad: number; total: number; enviadas: number; recibidas: number }[];
  return rows[0];
}

// Cierra el día: junta todas las transferencias activas en un nuevo cierre y
// devuelve el resumen. Si no hay ninguna activa, no crea nada (null).
// porcentaje es lo que cobra la financiera sobre el total de ese cierre.
export async function cerrarDiaTransferencias(
  storeId: string, createdBy: string, porcentaje: number,
): Promise<TransferenciaCierre | null> {
  const sql = getDb();
  const activas = await sql`
    SELECT id FROM transferencias WHERE store_id = ${storeId} AND cierre_id IS NULL
  ` as { id: number }[];
  if (!activas.length) return null;

  const cierreRows = await sql`
    INSERT INTO transferencia_cierres (store_id, created_by, created_at, porcentaje)
    VALUES (${storeId}, ${createdBy}, NOW(), ${porcentaje})
    RETURNING id, created_by, created_at, porcentaje
  ` as { id: number; created_by: string; created_at: string; porcentaje: number }[];
  const cierre = cierreRows[0];

  await sql`
    UPDATE transferencias SET cierre_id = ${cierre.id}
    WHERE store_id = ${storeId} AND cierre_id IS NULL
  `;

  const stats = await getCierreStats(storeId, cierre.id);
  const comision = Math.round(stats.total * cierre.porcentaje) / 100;
  const neto = Math.round((stats.total - comision) * 100) / 100;
  return { ...cierre, ...stats, comision, neto };
}

// Historial de cierres, con los totales calculados en vivo (recibida puede
// seguir cambiando después del cierre, así que no se guarda un total fijo).
export async function getCierres(storeId: string): Promise<TransferenciaCierre[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      tc.id, tc.created_by, tc.created_at, tc.porcentaje,
      COUNT(t.id)::int AS cantidad,
      COALESCE(SUM(t.monto), 0)::float AS total,
      COUNT(t.id) FILTER (WHERE t.enviada)::int AS enviadas,
      COUNT(t.id) FILTER (WHERE t.recibida)::int AS recibidas,
      ROUND(COALESCE(SUM(t.monto), 0) * tc.porcentaje / 100.0, 2)::float AS comision,
      ROUND(COALESCE(SUM(t.monto), 0) * (1 - tc.porcentaje / 100.0), 2)::float AS neto
    FROM transferencia_cierres tc
    LEFT JOIN transferencias t ON t.cierre_id = tc.id
    WHERE tc.store_id = ${storeId}
    GROUP BY tc.id, tc.created_by, tc.created_at, tc.porcentaje
    ORDER BY tc.created_at DESC
  `;
  return rows as TransferenciaCierre[];
}
