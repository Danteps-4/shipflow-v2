import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface MetaConexion {
  ad_account_id: string;
  nombre_cuenta: string;
  access_token: string;
  token_expires_at: string;
  connected_at: string;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initMetaTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS meta_conexiones (
      ad_account_id    TEXT PRIMARY KEY,
      nombre_cuenta    TEXT NOT NULL DEFAULT '',
      access_token     TEXT NOT NULL,
      token_expires_at TIMESTAMPTZ NOT NULL,
      connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

// Solo se soporta una cuenta conectada a la vez (v1): trae la más reciente.
export async function getMetaConexion(): Promise<MetaConexion | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT ad_account_id, nombre_cuenta, access_token, token_expires_at, connected_at
    FROM meta_conexiones
    ORDER BY connected_at DESC
    LIMIT 1
  ` as MetaConexion[];
  return rows[0] ?? null;
}

export async function upsertMetaConexion(data: {
  adAccountId: string; nombreCuenta: string; accessToken: string; tokenExpiresAt: Date;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO meta_conexiones (ad_account_id, nombre_cuenta, access_token, token_expires_at, connected_at)
    VALUES (${data.adAccountId}, ${data.nombreCuenta}, ${data.accessToken}, ${data.tokenExpiresAt.toISOString()}, NOW())
    ON CONFLICT (ad_account_id) DO UPDATE SET
      nombre_cuenta    = ${data.nombreCuenta},
      access_token     = ${data.accessToken},
      token_expires_at = ${data.tokenExpiresAt.toISOString()}
  `;
}

export async function updateMetaToken(adAccountId: string, accessToken: string, tokenExpiresAt: Date): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE meta_conexiones
    SET access_token = ${accessToken}, token_expires_at = ${tokenExpiresAt.toISOString()}
    WHERE ad_account_id = ${adAccountId}
  `;
}

export async function deleteMetaConexion(adAccountId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM meta_conexiones WHERE ad_account_id = ${adAccountId}`;
}
