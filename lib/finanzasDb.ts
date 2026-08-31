import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

// Gastos del negocio: se cargan por persona/categoría/detalle, como en el
// excel. Son de la cuenta en general, no de una tienda en particular.
export const CATEGORIAS_GASTO_NEGOCIO = [
  "Videos",
  "Guiones",
  "Redes sociales",
  "Imágenes",
  "Servidor",
  "AT cliente",
  "Finanzas",
  "Google ADS",
  "Profit",
  "Envíos",
  "Otros",
] as const;

export type CategoriaGastoNegocio = (typeof CATEGORIAS_GASTO_NEGOCIO)[number];

export interface GastoNegocio {
  id: number;
  fecha: string; // ISO date string YYYY-MM-DD
  persona: string | null;
  categoria: CategoriaGastoNegocio;
  detalle: string | null;
  cantidad: number | null;
  monto: number;
  pagado: boolean;
  created_at: string;
}

// Gastos personales: mucho más simples, solo fecha/descripción/monto.
export interface GastoPersonal {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  created_at: string;
}

export const FRECUENCIAS = ["mensual", "anual"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

// Un cambio de precio/frecuencia vigente a partir de una fecha. Se guarda un
// registro por cada valor que tuvo la suscripción a lo largo del tiempo, para
// poder saber cuánto costaba en un mes pasado en vez de aplicar el monto
// actual retroactivamente.
export interface SuscripcionMonto {
  monto: number;
  frecuencia: Frecuencia;
  desde: string; // ISO date
}

export interface Suscripcion {
  id: number;
  store_id: string;
  nombre: string;
  monto: number;
  frecuencia: Frecuencia;
  fecha_prox_pago: string; // ISO date
  activa: boolean;
  created_at: string;
  // Historial de montos, ordenado ascendente por `desde`. Siempre tiene al
  // menos un elemento (el que se cargó al crear la suscripción).
  historial: SuscripcionMonto[];
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initFinanzasTables(): Promise<void> {
  const sql = getDb();

  // Gastos del negocio y gastos personales son de la cuenta en general (no
  // se filtran por tienda): no llevan store_id.
  await sql`
    CREATE TABLE IF NOT EXISTS gastos_negocio (
      id         SERIAL PRIMARY KEY,
      fecha      DATE    NOT NULL,
      persona    TEXT,
      categoria  TEXT    NOT NULL DEFAULT 'Otros',
      detalle    TEXT,
      cantidad   NUMERIC(10,2),
      monto      NUMERIC(12,2) NOT NULL,
      pagado     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gastos_negocio_fecha
    ON gastos_negocio (fecha DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS gastos_personales (
      id          SERIAL PRIMARY KEY,
      fecha       DATE NOT NULL,
      descripcion TEXT NOT NULL,
      monto       NUMERIC(12,2) NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gastos_personales_fecha
    ON gastos_personales (fecha DESC)
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

  await sql`
    CREATE TABLE IF NOT EXISTS suscripcion_montos (
      id              SERIAL PRIMARY KEY,
      suscripcion_id  INTEGER NOT NULL REFERENCES suscripciones(id) ON DELETE CASCADE,
      monto           NUMERIC(12,2) NOT NULL,
      frecuencia      TEXT NOT NULL,
      desde           DATE NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS suscripcion_montos_sub
    ON suscripcion_montos (suscripcion_id, desde)
  `;
  // Suscripciones creadas antes de que existiera el historial: les cargamos
  // un primer registro con su monto/frecuencia actual, vigente desde que se
  // crearon (es lo más parecido a la realidad que podemos reconstruir).
  await sql`
    INSERT INTO suscripcion_montos (suscripcion_id, monto, frecuencia, desde)
    SELECT s.id, s.monto, s.frecuencia, s.created_at::date
    FROM suscripciones s
    WHERE NOT EXISTS (SELECT 1 FROM suscripcion_montos m WHERE m.suscripcion_id = s.id)
  `;

}

// ─── Gastos del negocio ──────────────────────────────────────────────────────
// Son de la cuenta en general (no de una tienda en particular).

export async function getGastosNegocio(limit = 300): Promise<GastoNegocio[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, fecha, persona, categoria, detalle, cantidad, monto, pagado, created_at
    FROM gastos_negocio
    ORDER BY fecha DESC, id DESC
    LIMIT ${limit}
  `;
  return rows as GastoNegocio[];
}

export async function createGastoNegocio(data: {
  fecha: string;
  persona: string | null;
  categoria: string;
  detalle: string | null;
  cantidad: number | null;
  monto: number;
  pagado: boolean;
}): Promise<GastoNegocio> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO gastos_negocio (fecha, persona, categoria, detalle, cantidad, monto, pagado)
    VALUES (${data.fecha}, ${data.persona}, ${data.categoria}, ${data.detalle}, ${data.cantidad}, ${data.monto}, ${data.pagado})
    RETURNING *
  ` as GastoNegocio[];
  return rows[0];
}

// El caller manda siempre el valor completo de cada campo que quiera cambiar;
// el resto se toma de la fila actual (permite, por ej., tildar "pagado" solo).
export async function updateGastoNegocio(
  id: number,
  data: Partial<{
    fecha: string;
    persona: string | null;
    categoria: string;
    detalle: string | null;
    cantidad: number | null;
    monto: number;
    pagado: boolean;
  }>,
): Promise<GastoNegocio | null> {
  const sql = getDb();
  const actualRows = await sql`
    SELECT fecha, persona, categoria, detalle, cantidad, monto, pagado
    FROM gastos_negocio WHERE id = ${id}
  ` as {
    fecha: string; persona: string | null; categoria: string; detalle: string | null;
    cantidad: number | null; monto: number; pagado: boolean;
  }[];
  if (!actualRows[0]) return null;
  const current = actualRows[0];

  const fecha     = data.fecha     ?? current.fecha;
  const persona   = data.persona   !== undefined ? data.persona   : current.persona;
  const categoria = data.categoria ?? current.categoria;
  const detalle   = data.detalle   !== undefined ? data.detalle   : current.detalle;
  const cantidad  = data.cantidad  !== undefined ? data.cantidad  : current.cantidad;
  const monto     = data.monto     ?? current.monto;
  const pagado    = data.pagado    ?? current.pagado;

  const rows = await sql`
    UPDATE gastos_negocio
    SET fecha = ${fecha}, persona = ${persona}, categoria = ${categoria}, detalle = ${detalle},
        cantidad = ${cantidad}, monto = ${monto}, pagado = ${pagado}
    WHERE id = ${id}
    RETURNING *
  ` as GastoNegocio[];
  return rows[0] ?? null;
}

export async function deleteGastoNegocio(id: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM gastos_negocio WHERE id = ${id} RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}

// ─── Gastos personales ───────────────────────────────────────────────────────

export async function getGastosPersonales(limit = 300): Promise<GastoPersonal[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, fecha, descripcion, monto, created_at
    FROM gastos_personales
    ORDER BY fecha DESC, id DESC
    LIMIT ${limit}
  `;
  return rows as GastoPersonal[];
}

export async function createGastoPersonal(
  fecha: string,
  descripcion: string,
  monto: number,
): Promise<GastoPersonal> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO gastos_personales (fecha, descripcion, monto)
    VALUES (${fecha}, ${descripcion}, ${monto})
    RETURNING *
  ` as GastoPersonal[];
  return rows[0];
}

export async function updateGastoPersonal(
  id: number,
  fecha: string,
  descripcion: string,
  monto: number,
): Promise<GastoPersonal | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE gastos_personales
    SET fecha = ${fecha}, descripcion = ${descripcion}, monto = ${monto}
    WHERE id = ${id}
    RETURNING *
  ` as GastoPersonal[];
  return rows[0] ?? null;
}

export async function deleteGastoPersonal(id: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM gastos_personales WHERE id = ${id} RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}

// ─── Suscripciones ───────────────────────────────────────────────────────────

async function getHistorial(suscripcionId: number): Promise<SuscripcionMonto[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT monto, frecuencia, desde
    FROM suscripcion_montos
    WHERE suscripcion_id = ${suscripcionId}
    ORDER BY desde ASC, id ASC
  `;
  return rows as SuscripcionMonto[];
}

export async function getSuscripciones(storeId: string): Promise<Suscripcion[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, store_id, nombre, monto, frecuencia, fecha_prox_pago, activa, created_at
    FROM suscripciones
    WHERE store_id = ${storeId}
    ORDER BY activa DESC, fecha_prox_pago ASC
  ` as Omit<Suscripcion, "historial">[];

  const historialRows = await sql`
    SELECT sm.suscripcion_id, sm.monto, sm.frecuencia, sm.desde
    FROM suscripcion_montos sm
    JOIN suscripciones s ON s.id = sm.suscripcion_id
    WHERE s.store_id = ${storeId}
    ORDER BY sm.desde ASC, sm.id ASC
  ` as (SuscripcionMonto & { suscripcion_id: number })[];

  const historialPorSub = new Map<number, SuscripcionMonto[]>();
  for (const h of historialRows) {
    const lista = historialPorSub.get(h.suscripcion_id) ?? [];
    lista.push({ monto: h.monto, frecuencia: h.frecuencia, desde: h.desde });
    historialPorSub.set(h.suscripcion_id, lista);
  }

  return rows.map(s => ({ ...s, historial: historialPorSub.get(s.id) ?? [] }));
}

export async function createSuscripcion(
  storeId: string,
  nombre: string,
  monto: number,
  frecuencia: string,
  fecha_prox_pago: string,
  vigenteDesde: string,
): Promise<Suscripcion> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO suscripciones (store_id, nombre, monto, frecuencia, fecha_prox_pago)
    VALUES (${storeId}, ${nombre}, ${monto}, ${frecuencia}, ${fecha_prox_pago})
    RETURNING *
  ` as Omit<Suscripcion, "historial">[];
  const suscripcion = rows[0];

  await sql`
    INSERT INTO suscripcion_montos (suscripcion_id, monto, frecuencia, desde)
    VALUES (${suscripcion.id}, ${monto}, ${frecuencia}, ${vigenteDesde})
  `;

  return { ...suscripcion, historial: await getHistorial(suscripcion.id) };
}

export async function updateSuscripcion(
  storeId: string,
  id: number,
  nombre: string,
  monto: number,
  frecuencia: string,
  fecha_prox_pago: string,
  activa: boolean,
  vigenteDesde: string,
): Promise<Suscripcion | null> {
  const sql = getDb();

  const existingRows = await sql`
    SELECT monto, frecuencia FROM suscripciones WHERE id = ${id} AND store_id = ${storeId}
  ` as { monto: string; frecuencia: string }[];
  if (existingRows.length === 0) return null;
  const cambioMontoOFrecuencia =
    Number(existingRows[0].monto) !== monto || existingRows[0].frecuencia !== frecuencia;

  const rows = await sql`
    UPDATE suscripciones
    SET nombre          = ${nombre},
        monto           = ${monto},
        frecuencia      = ${frecuencia},
        fecha_prox_pago = ${fecha_prox_pago},
        activa          = ${activa}
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING *
  ` as Omit<Suscripcion, "historial">[];
  if (rows.length === 0) return null;

  // El nuevo monto/frecuencia sólo rige desde `vigenteDesde` en adelante; los
  // meses anteriores siguen usando el registro de historial que tenían.
  if (cambioMontoOFrecuencia) {
    await sql`
      INSERT INTO suscripcion_montos (suscripcion_id, monto, frecuencia, desde)
      VALUES (${id}, ${monto}, ${frecuencia}, ${vigenteDesde})
    `;
  }

  return { ...rows[0], historial: await getHistorial(id) };
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
