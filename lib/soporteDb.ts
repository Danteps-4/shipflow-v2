import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const CATEGORIAS_TICKET = [
  "Envío",
  "Producto",
  "Pago",
  "Devolución",
  "Reclamo",
  "Consulta",
  "Otro",
] as const;

export type CategoriaTicket = (typeof CATEGORIAS_TICKET)[number];

export const ESTADOS_TICKET = ["pendiente", "en_proceso", "resuelto"] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export interface TicketImagen {
  id: number;
  url: string;
  public_id: string | null;
}

export interface Ticket {
  id: number;
  titulo: string;
  descripcion: string | null;
  categoria: CategoriaTicket;
  estado: EstadoTicket;
  resolucion: string | null;
  created_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  telefono: string | null;
  lista_id: number | null;
  imagenes: TicketImagen[];
}

export interface TicketLista {
  id: number;
  nombre: string;
  orden: number;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initSoporteTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS ticket_listas (
      id         SERIAL PRIMARY KEY,
      store_id   TEXT NOT NULL,
      nombre     TEXT NOT NULL,
      orden      INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tickets (
      id          SERIAL PRIMARY KEY,
      store_id    TEXT NOT NULL,
      titulo      TEXT NOT NULL,
      descripcion TEXT,
      categoria   TEXT NOT NULL DEFAULT 'Otro',
      estado      TEXT NOT NULL DEFAULT 'pendiente',
      resolucion  TEXT,
      created_by  TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      telefono    TEXT,
      lista_id    INTEGER REFERENCES ticket_listas(id) ON DELETE SET NULL
    )
  `;
  await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS telefono TEXT`;
  await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lista_id INTEGER REFERENCES ticket_listas(id) ON DELETE SET NULL`;
  await sql`
    CREATE INDEX IF NOT EXISTS tickets_store_estado
    ON tickets (store_id, estado, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ticket_imagenes (
      id         SERIAL PRIMARY KEY,
      ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      url        TEXT NOT NULL,
      public_id  TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS ticket_imagenes_ticket
    ON ticket_imagenes (ticket_id)
  `;
}

// ─── Listas personalizadas ───────────────────────────────────────────────────

export async function getListas(storeId: string): Promise<TicketLista[]> {
  const sql = getDb();
  return await sql`
    SELECT id, nombre, orden FROM ticket_listas
    WHERE store_id = ${storeId}
    ORDER BY orden ASC, id ASC
  ` as TicketLista[];
}

export async function createLista(storeId: string, nombre: string): Promise<TicketLista> {
  const sql = getDb();
  const [{ max }] = await sql`
    SELECT COALESCE(MAX(orden), -1) AS max FROM ticket_listas WHERE store_id = ${storeId}
  ` as { max: number }[];
  const rows = await sql`
    INSERT INTO ticket_listas (store_id, nombre, orden)
    VALUES (${storeId}, ${nombre}, ${max + 1})
    RETURNING id, nombre, orden
  ` as TicketLista[];
  return rows[0];
}

// Al borrar una lista, las tarjetas que tenía vuelven a Pendiente para no
// quedar huérfanas o invisibles en el tablero.
export async function deleteLista(storeId: string, id: number): Promise<boolean> {
  const sql = getDb();
  await sql`
    UPDATE tickets SET lista_id = NULL, estado = 'pendiente'
    WHERE store_id = ${storeId} AND lista_id = ${id}
  `;
  const rows = await sql`
    DELETE FROM ticket_listas WHERE store_id = ${storeId} AND id = ${id} RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

async function attachImagenes(storeId: string, tickets: Omit<Ticket, "imagenes">[]): Promise<Ticket[]> {
  if (!tickets.length) return [];
  const sql = getDb();
  const ids = tickets.map((t) => t.id);
  const imagenes = await sql`
    SELECT ti.id, ti.ticket_id, ti.url, ti.public_id
    FROM ticket_imagenes ti
    JOIN tickets t ON t.id = ti.ticket_id
    WHERE t.store_id = ${storeId} AND ti.ticket_id = ANY(${ids})
    ORDER BY ti.created_at
  ` as { id: number; ticket_id: number; url: string; public_id: string | null }[];

  return tickets.map((t) => ({
    ...t,
    imagenes: imagenes.filter((i) => i.ticket_id === t.id).map((i) => ({ id: i.id, url: i.url, public_id: i.public_id })),
  }));
}

export async function getTickets(storeId: string): Promise<Ticket[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, estado, resolucion, created_by, created_at, resolved_by, resolved_at, telefono, lista_id
    FROM tickets
    WHERE store_id = ${storeId}
    ORDER BY created_at DESC
  ` as Omit<Ticket, "imagenes">[];
  return attachImagenes(storeId, rows);
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function createTicket(
  storeId: string,
  data: {
    titulo: string;
    descripcion: string | null;
    categoria: string;
    createdBy: string;
    telefono?: string | null;
    imagenes: { url: string; publicId: string | null }[];
  },
): Promise<Ticket> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO tickets (store_id, titulo, descripcion, categoria, created_by, telefono)
    VALUES (${storeId}, ${data.titulo}, ${data.descripcion}, ${data.categoria}, ${data.createdBy}, ${data.telefono ?? null})
    RETURNING id, titulo, descripcion, categoria, estado, resolucion, created_by, created_at, resolved_by, resolved_at, telefono, lista_id
  ` as Omit<Ticket, "imagenes">[];
  const ticket = rows[0];

  for (const img of data.imagenes) {
    await sql`
      INSERT INTO ticket_imagenes (ticket_id, url, public_id)
      VALUES (${ticket.id}, ${img.url}, ${img.publicId})
    `;
  }

  const [withImagenes] = await attachImagenes(storeId, [ticket]);
  return withImagenes;
}

// Mueve una tarjeta a otro estado. Si pasa a "resuelto" se puede adjuntar una
// nota de resolución y queda registrado quién y cuándo la resolvió; si se
// mueve afuera de "resuelto" (ej. para reabrirla) esos datos se limpian.
export async function updateTicketEstado(
  storeId: string,
  id: number,
  estado: EstadoTicket,
  data: { resolucion?: string | null; resolvedBy?: string } = {},
): Promise<Ticket | null> {
  const sql = getDb();
  const existe = await sql`SELECT id FROM tickets WHERE store_id = ${storeId} AND id = ${id}` as { id: number }[];
  if (!existe.length) return null;

  // Moverla a una columna fija siempre la saca de cualquier lista personalizada.
  if (estado === "resuelto") {
    await sql`
      UPDATE tickets
      SET estado = ${estado}, resolucion = ${data.resolucion ?? null}, resolved_by = ${data.resolvedBy ?? ""}, resolved_at = NOW(), lista_id = NULL
      WHERE store_id = ${storeId} AND id = ${id}
    `;
  } else {
    await sql`
      UPDATE tickets
      SET estado = ${estado}, resolucion = NULL, resolved_by = NULL, resolved_at = NULL, lista_id = NULL
      WHERE store_id = ${storeId} AND id = ${id}
    `;
  }

  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, estado, resolucion, created_by, created_at, resolved_by, resolved_at, telefono, lista_id
    FROM tickets WHERE store_id = ${storeId} AND id = ${id}
  ` as Omit<Ticket, "imagenes">[];
  const [withImagenes] = await attachImagenes(storeId, rows);
  return withImagenes ?? null;
}

// Mueve una tarjeta a una lista personalizada (no toca el estado subyacente).
export async function moveTicketToLista(storeId: string, id: number, listaId: number): Promise<Ticket | null> {
  const sql = getDb();
  await sql`
    UPDATE tickets SET lista_id = ${listaId}
    WHERE store_id = ${storeId} AND id = ${id}
  `;
  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, estado, resolucion, created_by, created_at, resolved_by, resolved_at, telefono, lista_id
    FROM tickets WHERE store_id = ${storeId} AND id = ${id}
  ` as Omit<Ticket, "imagenes">[];
  const [withImagenes] = await attachImagenes(storeId, rows);
  return withImagenes ?? null;
}

export async function updateTicketTelefono(storeId: string, id: number, telefono: string | null): Promise<Ticket | null> {
  const sql = getDb();
  await sql`
    UPDATE tickets SET telefono = ${telefono}
    WHERE store_id = ${storeId} AND id = ${id}
  `;
  const rows = await sql`
    SELECT id, titulo, descripcion, categoria, estado, resolucion, created_by, created_at, resolved_by, resolved_at, telefono, lista_id
    FROM tickets WHERE store_id = ${storeId} AND id = ${id}
  ` as Omit<Ticket, "imagenes">[];
  const [withImagenes] = await attachImagenes(storeId, rows);
  return withImagenes ?? null;
}

export async function deleteTicket(storeId: string, id: number): Promise<{ publicIds: string[] } | null> {
  const sql = getDb();
  const imagenes = await sql`
    SELECT ti.public_id FROM ticket_imagenes ti
    JOIN tickets t ON t.id = ti.ticket_id
    WHERE t.store_id = ${storeId} AND ti.ticket_id = ${id}
  ` as { public_id: string | null }[];

  const rows = await sql`
    DELETE FROM tickets WHERE store_id = ${storeId} AND id = ${id} RETURNING id
  ` as { id: number }[];
  if (!rows.length) return null;

  return { publicIds: imagenes.map((i) => i.public_id).filter((id): id is string => !!id) };
}
