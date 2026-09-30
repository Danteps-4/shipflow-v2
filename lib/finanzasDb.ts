import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

// Categorías de gastos del negocio: antes era una lista fija en código, ahora
// se administran desde la UI (alta/rename/recolor/baja) y se guardan en su
// propia tabla. `categoria` en gastos_negocio sigue siendo TEXT libre (no FK)
// para no tener que migrar filas viejas si se borra una categoría.
const CATEGORIAS_SEED: { nombre: string; color: string }[] = [
  { nombre: "Videos", color: "#3b82f6" },
  { nombre: "Guiones", color: "#a78bfa" },
  { nombre: "Redes sociales", color: "#ec4899" },
  { nombre: "Imágenes", color: "#f59e0b" },
  { nombre: "Servidor", color: "#10b981" },
  { nombre: "AT cliente", color: "#06b6d4" },
  { nombre: "Finanzas", color: "#84cc16" },
  { nombre: "Google ADS", color: "#ef4444" },
  { nombre: "Profit", color: "#eab308" },
  { nombre: "Envíos", color: "#0ea5e9" },
  { nombre: "Otros", color: "#6b7280" },
];

export interface CategoriaGastoNegocio {
  id: number;
  nombre: string;
  color: string;
  orden: number;
}

export interface GastoNegocio {
  id: number;
  fecha: string; // ISO date string YYYY-MM-DD
  persona: string | null;
  categoria: string;
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

  await sql`
    CREATE TABLE IF NOT EXISTS categorias_gasto_negocio (
      id         SERIAL PRIMARY KEY,
      nombre     TEXT NOT NULL UNIQUE,
      color      TEXT NOT NULL DEFAULT '#6b7280',
      orden      INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Semilla idempotente: si ya existen (instalación vieja, categorías del
  // usuario), no se pisan ni se duplican.
  for (let i = 0; i < CATEGORIAS_SEED.length; i++) {
    const c = CATEGORIAS_SEED[i];
    await sql`
      INSERT INTO categorias_gasto_negocio (nombre, color, orden)
      VALUES (${c.nombre}, ${c.color}, ${i})
      ON CONFLICT (nombre) DO NOTHING
    `;
  }

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

export async function getGastosNegocio(limit = 5000): Promise<GastoNegocio[]> {
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

export async function getGastosPersonales(limit = 5000): Promise<GastoPersonal[]> {
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

// ─── Categorías de gastos del negocio ───────────────────────────────────────

export async function getCategoriasGastoNegocio(): Promise<CategoriaGastoNegocio[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, nombre, color, orden FROM categorias_gasto_negocio
    ORDER BY orden ASC, nombre ASC
  `;
  return rows as CategoriaGastoNegocio[];
}

export async function createCategoriaGastoNegocio(nombre: string, color: string): Promise<CategoriaGastoNegocio> {
  const sql = getDb();
  const maxRows = await sql`SELECT COALESCE(MAX(orden), -1) AS max FROM categorias_gasto_negocio` as { max: number }[];
  const orden = Number(maxRows[0].max) + 1;
  const rows = await sql`
    INSERT INTO categorias_gasto_negocio (nombre, color, orden)
    VALUES (${nombre}, ${color}, ${orden})
    RETURNING id, nombre, color, orden
  ` as CategoriaGastoNegocio[];
  return rows[0];
}

// Si se cambia el nombre, actualiza también los gastos existentes que usaban
// el nombre viejo (categoria es TEXT libre, no FK) para que no queden con una
// categoría "fantasma" que ya no aparece en la lista.
export async function updateCategoriaGastoNegocio(id: number, nombre: string, color: string): Promise<CategoriaGastoNegocio | null> {
  const sql = getDb();
  const actualRows = await sql`SELECT nombre FROM categorias_gasto_negocio WHERE id = ${id}` as { nombre: string }[];
  if (!actualRows[0]) return null;
  const nombreAnterior = actualRows[0].nombre;

  const rows = await sql`
    UPDATE categorias_gasto_negocio SET nombre = ${nombre}, color = ${color}
    WHERE id = ${id}
    RETURNING id, nombre, color, orden
  ` as CategoriaGastoNegocio[];
  if (!rows[0]) return null;

  if (nombreAnterior !== nombre) {
    await sql`UPDATE gastos_negocio SET categoria = ${nombre} WHERE categoria = ${nombreAnterior}`;
  }
  return rows[0];
}

// `categoria` en gastos_negocio es TEXT libre, no FK: borrar una categoría
// que todavía tenía gastos cargados no los rompe ni los borra, simplemente
// deja de aparecer en la lista para elegir en gastos nuevos (los gastos
// viejos conservan el nombre de texto que ya tenían).
export async function deleteCategoriaGastoNegocio(id: number): Promise<{ ok: true }> {
  const sql = getDb();
  await sql`DELETE FROM categorias_gasto_negocio WHERE id = ${id}`;
  return { ok: true };
}

// Reordena todas las categorías según el array de ids recibido (el orden de
// la lista es el orden final). Se usa desde los botones subir/bajar del
// modal de "Gestionar categorías".
export async function reorderCategoriasGastoNegocio(ids: number[]): Promise<void> {
  const sql = getDb();
  for (let i = 0; i < ids.length; i++) {
    await sql`UPDATE categorias_gasto_negocio SET orden = ${i} WHERE id = ${ids[i]}`;
  }
}
