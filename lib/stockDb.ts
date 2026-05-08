import { sql } from "./db";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface StockItem {
  sku: string;
  nombre: string;
  cantidad: number;
  updated_at: string;
}

export interface Movimiento {
  id: number;
  sku: string;
  cantidad: number;
  motivo: string;
  created_at: string;
}

export interface DeducirItem {
  sku: string;
  nombre: string;
  cantidad: number;
  motivo: string;
}

export interface DeducirResult {
  insuficiente: { sku: string; nombre: string; disponible: number; solicitado: number }[];
}

// ─── Init (CREATE TABLE IF NOT EXISTS) ──────────────────────────────────────

export async function initStockTables(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS stock (
      user_id    TEXT    NOT NULL,
      sku        TEXT    NOT NULL,
      nombre     TEXT    NOT NULL DEFAULT '',
      cantidad   INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, sku)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS movimientos (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT    NOT NULL,
      sku        TEXT    NOT NULL,
      cantidad   INTEGER NOT NULL,
      motivo     TEXT    NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS movimientos_user_created
    ON movimientos (user_id, created_at DESC)
  `;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getStock(userId: string): Promise<StockItem[]> {
  const rows = await sql`
    SELECT sku, nombre, cantidad, updated_at
    FROM stock
    WHERE user_id = ${userId}
    ORDER BY sku
  `;
  return rows as StockItem[];
}

export async function upsertStockItem(
  userId: string,
  sku: string,
  nombre: string,
  cantidad: number,
): Promise<void> {
  await sql`
    INSERT INTO stock (user_id, sku, nombre, cantidad, updated_at)
    VALUES (${userId}, ${sku}, ${nombre}, ${cantidad}, NOW())
    ON CONFLICT (user_id, sku)
    DO UPDATE SET nombre = ${nombre}, cantidad = ${cantidad}, updated_at = NOW()
  `;
}

export async function deleteStockItem(userId: string, sku: string): Promise<void> {
  await sql`DELETE FROM stock WHERE user_id = ${userId} AND sku = ${sku}`;
}

// ─── Deducir stock ──────────────────────────────────────────────────────────
// Descuenta cantidades. Permite stock negativo (solo avisa, no bloquea).

export async function deducirStock(
  userId: string,
  items: DeducirItem[],
): Promise<DeducirResult> {
  if (!items.length) return { insuficiente: [] };

  const skus = items.map(i => i.sku);
  const current = await sql`
    SELECT sku, cantidad FROM stock
    WHERE user_id = ${userId} AND sku = ANY(${skus})
  `;
  const stockMap = new Map((current as { sku: string; cantidad: number }[]).map(r => [r.sku, r.cantidad]));

  const insuficiente: DeducirResult["insuficiente"] = [];
  for (const item of items) {
    const disponible = stockMap.get(item.sku) ?? 0;
    if (disponible < item.cantidad) {
      insuficiente.push({ sku: item.sku, nombre: item.nombre, disponible, solicitado: item.cantidad });
    }
  }

  // Deducir (upsert primero para SKUs nuevos, luego restar)
  for (const item of items) {
    await sql`
      INSERT INTO stock (user_id, sku, nombre, cantidad, updated_at)
      VALUES (${userId}, ${item.sku}, ${item.nombre}, 0, NOW())
      ON CONFLICT (user_id, sku) DO NOTHING
    `;
    await sql`
      UPDATE stock
      SET cantidad = cantidad - ${item.cantidad}, updated_at = NOW()
      WHERE user_id = ${userId} AND sku = ${item.sku}
    `;
    await sql`
      INSERT INTO movimientos (user_id, sku, cantidad, motivo, created_at)
      VALUES (${userId}, ${item.sku}, ${-item.cantidad}, ${item.motivo}, NOW())
    `;
  }

  return { insuficiente };
}

// ─── Ajuste manual (suma o resta) ───────────────────────────────────────────

export async function ajustarStock(
  userId: string,
  sku: string,
  nombre: string,
  delta: number,
  motivo: string,
): Promise<void> {
  await sql`
    INSERT INTO stock (user_id, sku, nombre, cantidad, updated_at)
    VALUES (${userId}, ${sku}, ${nombre}, ${Math.max(0, delta)}, NOW())
    ON CONFLICT (user_id, sku)
    DO UPDATE SET cantidad = stock.cantidad + ${delta}, updated_at = NOW()
  `;
  await sql`
    INSERT INTO movimientos (user_id, sku, cantidad, motivo, created_at)
    VALUES (${userId}, ${sku}, ${delta}, ${motivo}, NOW())
  `;
}

// ─── Historial ───────────────────────────────────────────────────────────────

export async function getMovimientos(userId: string, limit = 200): Promise<Movimiento[]> {
  const rows = await sql`
    SELECT id, sku, cantidad, motivo, created_at
    FROM movimientos
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as Movimiento[];
}
