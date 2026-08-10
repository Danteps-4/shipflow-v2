import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

// Envío de reposición (cambio) que no viene de un pedido real de Tienda
// Nube: se carga a mano acá y se suma al Excel de Andreani desde la
// propia pestaña de Cambios, igual que un pedido más.
export type TipoCambio = "domicilio" | "sucursal";

export interface Cambio {
  id: number;
  store_id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  dni: string | null;
  motivo: string | null;
  // Número del pedido de Tienda Nube del que viene este cambio (opcional):
  // se usa solo para trazabilidad, no afecta el procesamiento.
  numero_pedido_original: string | null;
  tipo: TipoCambio;
  // Campos de domicilio (solo si tipo === "domicilio")
  direccion: string;
  numero_direccion: string;
  piso: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  // Campo de sucursal (solo si tipo === "sucursal")
  sucursal: string;
  procesado: boolean;
  created_by: string;
  created_at: string;
  procesado_at: string | null;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initCambiosTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS cambios (
      id               SERIAL PRIMARY KEY,
      store_id         TEXT NOT NULL,
      nombre           TEXT NOT NULL,
      telefono         TEXT NOT NULL,
      email            TEXT,
      dni              TEXT,
      motivo           TEXT,
      numero_pedido_original TEXT,
      tipo             TEXT NOT NULL CHECK (tipo IN ('domicilio','sucursal')),
      direccion        TEXT NOT NULL DEFAULT '',
      numero_direccion TEXT NOT NULL DEFAULT '',
      piso             TEXT NOT NULL DEFAULT '',
      localidad        TEXT NOT NULL DEFAULT '',
      provincia        TEXT NOT NULL DEFAULT '',
      codigo_postal    TEXT NOT NULL DEFAULT '',
      sucursal         TEXT NOT NULL DEFAULT '',
      procesado        BOOLEAN NOT NULL DEFAULT FALSE,
      created_by       TEXT NOT NULL DEFAULT '',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      procesado_at     TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS cambios_store_procesado
    ON cambios (store_id, procesado)
  `;
  // Migración: vínculo opcional al pedido de Tienda Nube original.
  await sql`ALTER TABLE cambios ADD COLUMN IF NOT EXISTS numero_pedido_original TEXT`;
  // El costo dejó de cargarse por cambio individual: ahora se carga un
  // costo total al procesar un lote entero (ver marcarCambiosProcesados en
  // app/api/cambios/route.ts), así que estas columnas no se usan más.
  await sql`ALTER TABLE cambios DROP COLUMN IF EXISTS costo`;
  await sql`ALTER TABLE cambios DROP COLUMN IF EXISTS gasto_id`;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function getCambios(storeId: string, filtros: { procesado?: boolean } = {}): Promise<Cambio[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT *
    FROM cambios
    WHERE store_id = ${storeId}
      AND (${filtros.procesado ?? null}::boolean IS NULL OR procesado = ${filtros.procesado ?? null})
    ORDER BY created_at DESC
  `;
  return rows as Cambio[];
}

export async function getCambioById(storeId: string, id: number): Promise<Cambio | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM cambios WHERE id = ${id} AND store_id = ${storeId}
  ` as Cambio[];
  return rows[0] ?? null;
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function createCambio(
  storeId: string,
  data: {
    nombre: string; telefono: string; email?: string; dni?: string; motivo?: string;
    numeroPedidoOriginal?: string;
    tipo: TipoCambio;
    direccion?: string; numeroDireccion?: string; piso?: string; localidad?: string;
    provincia?: string; codigoPostal?: string; sucursal?: string;
    createdBy: string;
  },
): Promise<Cambio> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO cambios (
      store_id, nombre, telefono, email, dni, motivo, numero_pedido_original, tipo,
      direccion, numero_direccion, piso, localidad, provincia, codigo_postal, sucursal,
      created_by
    )
    VALUES (
      ${storeId}, ${data.nombre}, ${data.telefono}, ${data.email ?? null}, ${data.dni ?? null}, ${data.motivo ?? null},
      ${data.numeroPedidoOriginal ?? null}, ${data.tipo},
      ${data.direccion ?? ""}, ${data.numeroDireccion ?? ""}, ${data.piso ?? ""}, ${data.localidad ?? ""},
      ${data.provincia ?? ""}, ${data.codigoPostal ?? ""}, ${data.sucursal ?? ""},
      ${data.createdBy}
    )
    RETURNING *
  `;
  return (rows as Cambio[])[0];
}

export async function updateCambio(
  storeId: string, id: number,
  data: {
    nombre: string; telefono: string; email?: string; dni?: string; motivo?: string;
    numeroPedidoOriginal?: string;
    tipo: TipoCambio;
    direccion?: string; numeroDireccion?: string; piso?: string; localidad?: string;
    provincia?: string; codigoPostal?: string; sucursal?: string;
  },
): Promise<Cambio | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE cambios
    SET nombre = ${data.nombre}, telefono = ${data.telefono}, email = ${data.email ?? null},
        dni = ${data.dni ?? null}, motivo = ${data.motivo ?? null},
        numero_pedido_original = ${data.numeroPedidoOriginal ?? null}, tipo = ${data.tipo},
        direccion = ${data.direccion ?? ""}, numero_direccion = ${data.numeroDireccion ?? ""},
        piso = ${data.piso ?? ""}, localidad = ${data.localidad ?? ""},
        provincia = ${data.provincia ?? ""}, codigo_postal = ${data.codigoPostal ?? ""},
        sucursal = ${data.sucursal ?? ""}
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING *
  `;
  return (rows as Cambio[])[0] ?? null;
}

// Marca como procesados los cambios que efectivamente salieron en un
// Excel exportado, para que no se vuelvan a procesar la próxima vez.
export async function marcarCambiosProcesados(storeId: string, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const sql = getDb();
  await sql`
    UPDATE cambios
    SET procesado = TRUE, procesado_at = NOW()
    WHERE store_id = ${storeId} AND id = ANY(${ids})
  `;
}

export async function deleteCambio(storeId: string, id: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM cambios
    WHERE id = ${id} AND store_id = ${storeId}
    RETURNING id
  ` as { id: number }[];
  return rows.length > 0;
}
