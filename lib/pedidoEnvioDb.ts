import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoEnvio = "domicilio" | "sucursal" | "retiro";

// Override manual completo de un pedido: tipo de envío + los datos de
// domicilio o el nombre de sucursal, todos opcionales (null = no hay
// override para ese campo, se usa lo que vino de Tienda Nube).
export interface EnvioOverride {
  tipo: TipoEnvio | null;
  direccion: string | null;
  numeroDireccion: string | null;
  piso: string | null;
  localidad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  sucursal: string | null;
}

const OVERRIDE_VACIO: EnvioOverride = {
  tipo: null, direccion: null, numeroDireccion: null, piso: null,
  localidad: null, provincia: null, codigoPostal: null, sucursal: null,
};

function esOverrideVacio(o: EnvioOverride): boolean {
  return Object.values(o).every(v => v === null);
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initPedidoEnvioTables(): Promise<void> {
  const sql = getDb();

  // Override manual de un pedido: si va a domicilio, a sucursal, o es
  // retiro presencial (el cliente compró pero lo retira en el local), y
  // opcionalmente una dirección o sucursal distinta a la que vino de
  // Tienda Nube (ej: el cliente pidió cambiarla después de comprar). Se usa
  // para corregir la detección automática antes de procesar, y queda
  // recordado para la próxima vez que se genere el Excel de ese pedido.
  await sql`
    CREATE TABLE IF NOT EXISTS pedido_envio_overrides (
      id           SERIAL PRIMARY KEY,
      store_id     TEXT NOT NULL,
      numero_orden TEXT NOT NULL,
      tipo         TEXT CHECK (tipo IN ('domicilio','sucursal','retiro')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (store_id, numero_orden)
    )
  `;

  // Migración: permitir el nuevo tipo 'retiro' en tablas ya creadas.
  await sql`ALTER TABLE pedido_envio_overrides DROP CONSTRAINT IF EXISTS pedido_envio_overrides_tipo_check`;
  await sql`ALTER TABLE pedido_envio_overrides ADD CONSTRAINT pedido_envio_overrides_tipo_check CHECK (tipo IN ('domicilio','sucursal','retiro'))`;

  // Migración: tipo pasa a ser opcional (puede haber override de dirección
  // sin cambiar el tipo), y se agregan las columnas de dirección/sucursal.
  await sql`ALTER TABLE pedido_envio_overrides ALTER COLUMN tipo DROP NOT NULL`;
  await sql`ALTER TABLE pedido_envio_overrides ADD COLUMN IF NOT EXISTS direccion TEXT`;
  await sql`ALTER TABLE pedido_envio_overrides ADD COLUMN IF NOT EXISTS numero_direccion TEXT`;
  await sql`ALTER TABLE pedido_envio_overrides ADD COLUMN IF NOT EXISTS piso TEXT`;
  await sql`ALTER TABLE pedido_envio_overrides ADD COLUMN IF NOT EXISTS localidad TEXT`;
  await sql`ALTER TABLE pedido_envio_overrides ADD COLUMN IF NOT EXISTS provincia TEXT`;
  await sql`ALTER TABLE pedido_envio_overrides ADD COLUMN IF NOT EXISTS codigo_postal TEXT`;
  await sql`ALTER TABLE pedido_envio_overrides ADD COLUMN IF NOT EXISTS sucursal TEXT`;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function getEnvioOverridesPorOrdenes(
  storeId: string, numerosOrden: string[],
): Promise<Record<string, EnvioOverride>> {
  if (!numerosOrden.length) return {};
  const sql = getDb();
  const rows = await sql`
    SELECT numero_orden, tipo, direccion, numero_direccion, piso, localidad, provincia, codigo_postal, sucursal
    FROM pedido_envio_overrides
    WHERE store_id = ${storeId} AND numero_orden = ANY(${numerosOrden})
  ` as {
    numero_orden: string; tipo: TipoEnvio | null; direccion: string | null; numero_direccion: string | null;
    piso: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null;
    sucursal: string | null;
  }[];

  const result: Record<string, EnvioOverride> = {};
  for (const row of rows) {
    result[row.numero_orden] = {
      tipo: row.tipo,
      direccion: row.direccion,
      numeroDireccion: row.numero_direccion,
      piso: row.piso,
      localidad: row.localidad,
      provincia: row.provincia,
      codigoPostal: row.codigo_postal,
      sucursal: row.sucursal,
    };
  }
  return result;
}

// ─── Escritura ───────────────────────────────────────────────────────────────

// El caller manda siempre el override completo (no solo el campo que
// cambió), así se evita tener que armar un UPDATE parcial dinámico. Si
// queda todo en null, se borra la fila (vuelve a la detección automática).
export async function setEnvioOverride(
  storeId: string, numeroOrden: string, override: EnvioOverride,
): Promise<void> {
  const sql = getDb();
  if (esOverrideVacio(override)) {
    await sql`DELETE FROM pedido_envio_overrides WHERE store_id = ${storeId} AND numero_orden = ${numeroOrden}`;
    return;
  }
  await sql`
    INSERT INTO pedido_envio_overrides
      (store_id, numero_orden, tipo, direccion, numero_direccion, piso, localidad, provincia, codigo_postal, sucursal)
    VALUES
      (${storeId}, ${numeroOrden}, ${override.tipo}, ${override.direccion}, ${override.numeroDireccion},
       ${override.piso}, ${override.localidad}, ${override.provincia}, ${override.codigoPostal}, ${override.sucursal})
    ON CONFLICT (store_id, numero_orden) DO UPDATE SET
      tipo = ${override.tipo}, direccion = ${override.direccion}, numero_direccion = ${override.numeroDireccion},
      piso = ${override.piso}, localidad = ${override.localidad}, provincia = ${override.provincia},
      codigo_postal = ${override.codigoPostal}, sucursal = ${override.sucursal}
  `;
}
