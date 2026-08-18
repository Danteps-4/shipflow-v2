import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const ESTADOS_RECLAMO = ["pendiente", "en_proceso", "resuelto"] as const;
export type EstadoReclamo = (typeof ESTADOS_RECLAMO)[number];

export interface ReclamoImagen {
  id: number;
  url: string;
  public_id: string | null;
}

export interface Reclamo {
  id: number;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  plataforma: string | null;
  estado: EstadoReclamo;
  resolucion: string | null;
  // Notas de seguimiento: a diferencia de "resolucion" (que se carga una
  // sola vez al pasar a Resuelto), esto se va actualizando mientras el
  // caso sigue abierto — reemplaza el uso que le daban a varias columnas
  // sueltas en la planilla que manejaban antes.
  notas: string | null;
  // N° de seguimiento Andreani del envío de reposición, si el reclamo
  // terminó generando un cambio/reenvío.
  tracking: string | null;
  asignado_a: string | null;
  telefono: string | null;
  created_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  lista_id: number | null;
  ticket_origen_id: number | null;
  imagenes: ReclamoImagen[];
}

export interface ReclamoLista {
  id: number;
  nombre: string;
  orden: number;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initReclamosTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS reclamo_listas (
      id         SERIAL PRIMARY KEY,
      store_id   TEXT NOT NULL,
      nombre     TEXT NOT NULL,
      orden      INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS reclamos (
      id                SERIAL PRIMARY KEY,
      store_id          TEXT NOT NULL,
      titulo            TEXT NOT NULL,
      descripcion       TEXT,
      categoria         TEXT NOT NULL DEFAULT 'Otro',
      plataforma        TEXT,
      estado            TEXT NOT NULL DEFAULT 'pendiente',
      resolucion        TEXT,
      notas             TEXT,
      tracking          TEXT,
      asignado_a        TEXT,
      telefono          TEXT,
      created_by        TEXT NOT NULL DEFAULT '',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_by       TEXT,
      resolved_at       TIMESTAMPTZ,
      lista_id          INTEGER REFERENCES reclamo_listas(id) ON DELETE SET NULL,
      -- Sin REFERENCES a "tickets" a propósito: esa tabla la crea
      -- initSoporteTables() por separado, sin garantía de orden entre inits.
      ticket_origen_id  INTEGER
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS reclamos_store_estado
    ON reclamos (store_id, estado, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS reclamo_imagenes (
      id          SERIAL PRIMARY KEY,
      reclamo_id  INTEGER NOT NULL REFERENCES reclamos(id) ON DELETE CASCADE,
      url         TEXT NOT NULL,
      public_id   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS reclamo_imagenes_reclamo
    ON reclamo_imagenes (reclamo_id)
  `;
}

// ─── Listas personalizadas ───────────────────────────────────────────────────

export async function getListas(storeId: string): Promise<ReclamoLista[]> {
  const sql = getDb();
  return await sql`
    SELECT id, nombre, orden FROM reclamo_listas
    WHERE store_id = ${storeId}
    ORDER BY orden ASC, id ASC
  ` as ReclamoLista[];
}

export async function createLista(storeId: string, nombre: string): Promise<ReclamoLista> {
  const sql = getDb();
  const [{ max }] = await sql`
    SELECT COALESCE(MAX(orden), -1) AS max FROM reclamo_listas WHERE store_id = ${storeId}
  ` as { max: number }[];
  const rows = await sql`
    INSERT INTO reclamo_listas (store_id, nombre, orden)
    VALUES (${storeId}, ${nombre}, ${max + 1})
    RETURNING id, nombre, orden
  ` as ReclamoLista[];
  return rows[0];
}

// Al borrar una lista, las tarjetas que tenía vuelven a Pendiente para no
// quedar huérfanas o invisibles en el tablero.
export async function deleteLista(storeId: string, id: number): Promise<boolean> {
  const sql = getDb();
  await sql`
    UPDATE reclamos SET lista_id = NULL, estado = 'pendiente'
    WHERE store_id = ${storeId} AND lista_id = ${id}
  `;
  const rows = await sql`
    DELETE FROM reclamo_listas WHERE store_id = ${storeId} AND id = ${id} RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

async function attachImagenes(storeId: string, reclamos: Omit<Reclamo, "imagenes">[]): Promise<Reclamo[]> {
  if (!reclamos.length) return [];
  const sql = getDb();
  const ids = reclamos.map((r) => r.id);
  const imagenes = await sql`
    SELECT ri.id, ri.reclamo_id, ri.url, ri.public_id
    FROM reclamo_imagenes ri
    JOIN reclamos r ON r.id = ri.reclamo_id
    WHERE r.store_id = ${storeId} AND ri.reclamo_id = ANY(${ids})
    ORDER BY ri.created_at
  ` as { id: number; reclamo_id: number; url: string; public_id: string | null }[];

  return reclamos.map((r) => ({
    ...r,
    imagenes: imagenes.filter((i) => i.reclamo_id === r.id).map((i) => ({ id: i.id, url: i.url, public_id: i.public_id })),
  }));
}

export async function getReclamos(storeId: string): Promise<Reclamo[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, plataforma, estado, resolucion, notas, tracking, asignado_a, telefono, created_by, created_at, resolved_by, resolved_at, lista_id, ticket_origen_id
    FROM reclamos
    WHERE store_id = ${storeId}
    ORDER BY created_at DESC
  ` as Omit<Reclamo, "imagenes">[];
  return attachImagenes(storeId, rows);
}

// ─── Escritura ───────────────────────────────────────────────────────────────

// Se usa desde /api/reclamos/convertir: arma un reclamo a partir de un
// ticket de Soporte ya existente, copiando sus imágenes (referencian el
// mismo asset de Cloudinary, no se vuelven a subir).
export async function createReclamo(
  storeId: string,
  data: {
    titulo: string;
    descripcion: string | null;
    categoria: string;
    plataforma?: string | null;
    telefono?: string | null;
    createdBy: string;
    ticketOrigenId?: number | null;
    imagenes: { url: string; publicId: string | null }[];
  },
): Promise<Reclamo> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO reclamos (store_id, titulo, descripcion, categoria, plataforma, telefono, created_by, ticket_origen_id)
    VALUES (${storeId}, ${data.titulo}, ${data.descripcion}, ${data.categoria}, ${data.plataforma ?? null}, ${data.telefono ?? null}, ${data.createdBy}, ${data.ticketOrigenId ?? null})
    RETURNING id, titulo, descripcion, categoria, plataforma, estado, resolucion, notas, tracking, asignado_a, telefono, created_by, created_at, resolved_by, resolved_at, lista_id, ticket_origen_id
  ` as Omit<Reclamo, "imagenes">[];
  const reclamo = rows[0];

  for (const img of data.imagenes) {
    await sql`
      INSERT INTO reclamo_imagenes (reclamo_id, url, public_id)
      VALUES (${reclamo.id}, ${img.url}, ${img.publicId})
    `;
  }

  const [withImagenes] = await attachImagenes(storeId, [reclamo]);
  return withImagenes;
}

// Mueve una tarjeta a otro estado. Si pasa a "resuelto" se puede adjuntar
// una nota de resolución y queda registrado quién y cuándo la resolvió; si
// se mueve afuera de "resuelto" (ej. para reabrirla) esos datos se limpian.
export async function updateReclamoEstado(
  storeId: string,
  id: number,
  estado: EstadoReclamo,
  data: { resolucion?: string | null; resolvedBy?: string } = {},
): Promise<Reclamo | null> {
  const sql = getDb();
  const existe = await sql`SELECT id FROM reclamos WHERE store_id = ${storeId} AND id = ${id}` as { id: number }[];
  if (!existe.length) return null;

  if (estado === "resuelto") {
    await sql`
      UPDATE reclamos
      SET estado = ${estado}, resolucion = ${data.resolucion ?? null}, resolved_by = ${data.resolvedBy ?? ""}, resolved_at = NOW(), lista_id = NULL
      WHERE store_id = ${storeId} AND id = ${id}
    `;
  } else {
    await sql`
      UPDATE reclamos
      SET estado = ${estado}, resolucion = NULL, resolved_by = NULL, resolved_at = NULL, lista_id = NULL
      WHERE store_id = ${storeId} AND id = ${id}
    `;
  }

  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, plataforma, estado, resolucion, notas, tracking, asignado_a, telefono, created_by, created_at, resolved_by, resolved_at, lista_id, ticket_origen_id
    FROM reclamos WHERE store_id = ${storeId} AND id = ${id}
  ` as Omit<Reclamo, "imagenes">[];
  const [withImagenes] = await attachImagenes(storeId, rows);
  return withImagenes ?? null;
}

// Mueve una tarjeta a una lista personalizada (no toca el estado subyacente).
export async function moveReclamoToLista(storeId: string, id: number, listaId: number): Promise<Reclamo | null> {
  const sql = getDb();
  await sql`
    UPDATE reclamos SET lista_id = ${listaId}
    WHERE store_id = ${storeId} AND id = ${id}
  `;
  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, plataforma, estado, resolucion, notas, tracking, asignado_a, telefono, created_by, created_at, resolved_by, resolved_at, lista_id, ticket_origen_id
    FROM reclamos WHERE store_id = ${storeId} AND id = ${id}
  ` as Omit<Reclamo, "imagenes">[];
  const [withImagenes] = await attachImagenes(storeId, rows);
  return withImagenes ?? null;
}

// Actualiza los campos "vivos" del reclamo (se editan en cualquier momento,
// no solo al resolverlo): teléfono, plataforma, tracking, notas de
// seguimiento y quién lo está resolviendo. Solo pisa los campos presentes
// en `data` (undefined = no tocar).
export async function updateReclamoCampos(
  storeId: string,
  id: number,
  data: { telefono?: string | null; plataforma?: string | null; tracking?: string | null; notas?: string | null; asignadoA?: string | null },
): Promise<Reclamo | null> {
  const sql = getDb();
  const actual = await sql`
    SELECT telefono, plataforma, tracking, notas, asignado_a FROM reclamos WHERE store_id = ${storeId} AND id = ${id}
  ` as { telefono: string | null; plataforma: string | null; tracking: string | null; notas: string | null; asignado_a: string | null }[];
  if (!actual.length) return null;
  const cur = actual[0];

  const telefono   = data.telefono   !== undefined ? data.telefono   : cur.telefono;
  const plataforma = data.plataforma !== undefined ? data.plataforma : cur.plataforma;
  const tracking   = data.tracking   !== undefined ? data.tracking   : cur.tracking;
  const notas      = data.notas      !== undefined ? data.notas      : cur.notas;
  const asignadoA  = data.asignadoA  !== undefined ? data.asignadoA  : cur.asignado_a;

  await sql`
    UPDATE reclamos
    SET telefono = ${telefono}, plataforma = ${plataforma}, tracking = ${tracking}, notas = ${notas}, asignado_a = ${asignadoA}
    WHERE store_id = ${storeId} AND id = ${id}
  `;
  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, plataforma, estado, resolucion, notas, tracking, asignado_a, telefono, created_by, created_at, resolved_by, resolved_at, lista_id, ticket_origen_id
    FROM reclamos WHERE store_id = ${storeId} AND id = ${id}
  ` as Omit<Reclamo, "imagenes">[];
  const [withImagenes] = await attachImagenes(storeId, rows);
  return withImagenes ?? null;
}

export async function deleteReclamo(storeId: string, id: number): Promise<{ publicIds: string[] } | null> {
  const sql = getDb();
  const imagenes = await sql`
    SELECT ri.public_id FROM reclamo_imagenes ri
    JOIN reclamos r ON r.id = ri.reclamo_id
    WHERE r.store_id = ${storeId} AND ri.reclamo_id = ${id}
  ` as { public_id: string | null }[];

  const rows = await sql`
    DELETE FROM reclamos WHERE store_id = ${storeId} AND id = ${id} RETURNING id
  ` as { id: number }[];
  if (!rows.length) return null;

  return { publicIds: imagenes.map((i) => i.public_id).filter((id): id is string => !!id) };
}
