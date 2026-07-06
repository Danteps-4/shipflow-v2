import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TnConexion {
  store_id: string;
  access_token: string;
  store_name: string;
}

export interface MlConexion {
  store_id: string;
  ml_user_id: string;
  nickname: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initMlTables(): Promise<void> {
  const sql = getDb();

  // Índice inverso store_id → access_token de Tienda Nube, para que los
  // webhooks (que llegan sin sesión de navegador) puedan resolver
  // credenciales solo con el store_id que manda TN en el payload.
  await sql`
    CREATE TABLE IF NOT EXISTS tn_conexiones (
      store_id     TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      store_name   TEXT NOT NULL DEFAULT '',
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Conexión OAuth de Mercado Libre, atada a la tienda TN activa del
  // usuario (mismo store_id que particiona stock/movimientos).
  await sql`
    CREATE TABLE IF NOT EXISTS ml_conexiones (
      store_id      TEXT PRIMARY KEY,
      ml_user_id    TEXT NOT NULL UNIQUE,
      nickname      TEXT NOT NULL DEFAULT '',
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    TIMESTAMPTZ NOT NULL,
      connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Cache de SKU por publicación de ML, para no pegarle a /items/{id}
  // en cada webhook de venta.
  await sql`
    CREATE TABLE IF NOT EXISTS ml_items_sku (
      store_id        TEXT NOT NULL,
      ml_item_id       TEXT NOT NULL,
      ml_variation_id TEXT NOT NULL DEFAULT '',
      sku             TEXT NOT NULL,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, ml_item_id, ml_variation_id)
    )
  `;
}

// ─── tn_conexiones ───────────────────────────────────────────────────────────

export async function upsertTnConexion(
  storeId: string, accessToken: string, storeName: string,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO tn_conexiones (store_id, access_token, store_name, updated_at)
    VALUES (${storeId}, ${accessToken}, ${storeName}, NOW())
    ON CONFLICT (store_id)
    DO UPDATE SET access_token = ${accessToken}, store_name = ${storeName}, updated_at = NOW()
  `;
}

export async function getTnConexion(storeId: string): Promise<TnConexion | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT store_id, access_token, store_name
    FROM tn_conexiones
    WHERE store_id = ${storeId}
  ` as TnConexion[];
  return rows[0] ?? null;
}

export async function deleteTnConexion(storeId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM tn_conexiones WHERE store_id = ${storeId}`;
}

// ─── ml_conexiones ───────────────────────────────────────────────────────────

export async function upsertMlConexion(data: {
  storeId: string;
  mlUserId: string;
  nickname: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO ml_conexiones (store_id, ml_user_id, nickname, access_token, refresh_token, expires_at, connected_at)
    VALUES (${data.storeId}, ${data.mlUserId}, ${data.nickname}, ${data.accessToken}, ${data.refreshToken}, ${data.expiresAt.toISOString()}, NOW())
    ON CONFLICT (store_id) DO UPDATE SET
      ml_user_id    = ${data.mlUserId},
      nickname      = ${data.nickname},
      access_token  = ${data.accessToken},
      refresh_token = ${data.refreshToken},
      expires_at    = ${data.expiresAt.toISOString()}
  `;
}

export async function getMlConexionByStoreId(storeId: string): Promise<MlConexion | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT store_id, ml_user_id, nickname, access_token, refresh_token, expires_at
    FROM ml_conexiones
    WHERE store_id = ${storeId}
  ` as MlConexion[];
  return rows[0] ?? null;
}

export async function getMlConexionByMlUserId(mlUserId: string): Promise<MlConexion | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT store_id, ml_user_id, nickname, access_token, refresh_token, expires_at
    FROM ml_conexiones
    WHERE ml_user_id = ${mlUserId}
  ` as MlConexion[];
  return rows[0] ?? null;
}

export async function updateMlTokens(
  storeId: string, accessToken: string, refreshToken: string, expiresAt: Date,
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE ml_conexiones
    SET access_token = ${accessToken}, refresh_token = ${refreshToken}, expires_at = ${expiresAt.toISOString()}
    WHERE store_id = ${storeId}
  `;
}

export async function deleteMlConexion(storeId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM ml_conexiones WHERE store_id = ${storeId}`;
}

// ─── ml_items_sku (cache) ────────────────────────────────────────────────────

export async function getCachedSku(
  storeId: string, mlItemId: string, mlVariationId: string,
): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT sku FROM ml_items_sku
    WHERE store_id = ${storeId} AND ml_item_id = ${mlItemId} AND ml_variation_id = ${mlVariationId}
  ` as { sku: string }[];
  return rows[0]?.sku ?? null;
}

export async function cacheSku(
  storeId: string, mlItemId: string, mlVariationId: string, sku: string,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO ml_items_sku (store_id, ml_item_id, ml_variation_id, sku, updated_at)
    VALUES (${storeId}, ${mlItemId}, ${mlVariationId}, ${sku}, NOW())
    ON CONFLICT (store_id, ml_item_id, ml_variation_id)
    DO UPDATE SET sku = ${sku}, updated_at = NOW()
  `;
}
