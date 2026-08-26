import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

// PDFs de etiquetas ya generados (con SKU / ZPL→PDF) o subidos a mano, para
// que la persona de depósito los vea, descargue e imprima sin necesitar
// acceso a Pedidos ni Mercado Libre.
export type OrigenEtiquetaDeposito = "tienda_nube" | "mercado_libre";
export type EstadoEtiquetaDeposito = "pendiente" | "impresa";

export interface EtiquetaDeposito {
  id: number;
  store_id: string;
  origen: OrigenEtiquetaDeposito;
  titulo: string;
  url: string;
  public_id: string;
  estado: EstadoEtiquetaDeposito;
  created_by: string;
  created_at: string;
  impresa_by: string | null;
  impresa_at: string | null;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initDepositoTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS etiquetas_deposito (
      id          SERIAL PRIMARY KEY,
      store_id    TEXT NOT NULL,
      origen      TEXT NOT NULL,
      titulo      TEXT NOT NULL,
      url         TEXT NOT NULL,
      public_id   TEXT NOT NULL,
      estado      TEXT NOT NULL DEFAULT 'pendiente',
      created_by  TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      impresa_by  TEXT,
      impresa_at  TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS etiquetas_deposito_store_estado
    ON etiquetas_deposito (store_id, estado, created_at DESC)
  `;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

// Sin filtro por store_id a propósito: depósito ve las etiquetas de TODAS
// las tiendas de Tienda Nube conectadas mezcladas en una sola lista, no
// separadas por la tienda activa del usuario (que además puede cambiar en
// cualquier momento con el StoreSwitcher, sin relación con lo que depósito
// necesita ver). store_id se sigue guardando en cada fila solo a modo de
// registro de origen.
export async function getEtiquetasDeposito(
  estado: EstadoEtiquetaDeposito,
): Promise<EtiquetaDeposito[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM etiquetas_deposito
    WHERE estado = ${estado}
    ORDER BY created_at DESC
  `;
  return rows as EtiquetaDeposito[];
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function createEtiquetaDeposito(
  storeId: string,
  data: { origen: OrigenEtiquetaDeposito; titulo: string; url: string; publicId: string; createdBy: string },
): Promise<EtiquetaDeposito> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO etiquetas_deposito (store_id, origen, titulo, url, public_id, created_by)
    VALUES (${storeId}, ${data.origen}, ${data.titulo}, ${data.url}, ${data.publicId}, ${data.createdBy})
    RETURNING *
  ` as EtiquetaDeposito[];
  return rows[0];
}

export async function marcarEtiquetaImpresa(
  id: number, impresaBy: string,
): Promise<EtiquetaDeposito | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE etiquetas_deposito
    SET estado = 'impresa', impresa_by = ${impresaBy}, impresa_at = NOW()
    WHERE id = ${id}
    RETURNING *
  ` as EtiquetaDeposito[];
  return rows[0] ?? null;
}

export async function deleteEtiquetaDeposito(id: number): Promise<{ public_id: string } | null> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM etiquetas_deposito
    WHERE id = ${id}
    RETURNING public_id
  ` as { public_id: string }[];
  return rows[0] ?? null;
}
