import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

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

export interface KitComponent {
  component_sku: string;
  cantidad: number;
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

// ─── Init + migración ────────────────────────────────────────────────────────

export async function initStockTables(): Promise<void> {
  const sql = getDb();

  // Migración: user_id → store_id si existe la columna vieja
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stock' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE stock RENAME COLUMN user_id TO store_id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'movimientos' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE movimientos RENAME COLUMN user_id TO store_id;
      END IF;
    END $$
  `;

  // Tabla de stock por tienda
  await sql`
    CREATE TABLE IF NOT EXISTS stock (
      store_id   TEXT    NOT NULL,
      sku        TEXT    NOT NULL,
      nombre     TEXT    NOT NULL DEFAULT '',
      cantidad   INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, sku)
    )
  `;

  // Historial de movimientos
  await sql`
    CREATE TABLE IF NOT EXISTS movimientos (
      id         SERIAL PRIMARY KEY,
      store_id   TEXT    NOT NULL,
      sku        TEXT    NOT NULL,
      cantidad   INTEGER NOT NULL,
      motivo     TEXT    NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS movimientos_store_created
    ON movimientos (store_id, created_at DESC)
  `;

  // Definición de kits/bundles
  // kit_sku → lista de (component_sku, cantidad)
  await sql`
    CREATE TABLE IF NOT EXISTS kits (
      store_id      TEXT    NOT NULL,
      kit_sku       TEXT    NOT NULL,
      component_sku TEXT    NOT NULL,
      cantidad      INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (store_id, kit_sku, component_sku)
    )
  `;
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export async function getStock(storeId: string): Promise<StockItem[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT sku, nombre, cantidad, updated_at
    FROM stock
    WHERE store_id = ${storeId}
    ORDER BY sku
  `;
  return rows as StockItem[];
}

export async function upsertStockItem(
  storeId: string, sku: string, nombre: string, cantidad: number,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO stock (store_id, sku, nombre, cantidad, updated_at)
    VALUES (${storeId}, ${sku}, ${nombre}, ${cantidad}, NOW())
    ON CONFLICT (store_id, sku)
    DO UPDATE SET nombre = ${nombre}, cantidad = ${cantidad}, updated_at = NOW()
  `;
}

export async function deleteStockItem(storeId: string, sku: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM stock WHERE store_id = ${storeId} AND sku = ${sku}`;
  await sql`DELETE FROM kits  WHERE store_id = ${storeId} AND kit_sku = ${sku}`;
}

// ─── Kits ─────────────────────────────────────────────────────────────────────

export interface KitMap {
  [kitSku: string]: KitComponent[];
}

// Devuelve todos los kits de la tienda: { kitSku → [{ component_sku, cantidad }] }
export async function getAllKits(storeId: string): Promise<KitMap> {
  const sql = getDb();
  const rows = await sql`
    SELECT kit_sku, component_sku, cantidad
    FROM kits
    WHERE store_id = ${storeId}
    ORDER BY kit_sku, component_sku
  ` as { kit_sku: string; component_sku: string; cantidad: number }[];

  const result: KitMap = {};
  for (const r of rows) {
    if (!result[r.kit_sku]) result[r.kit_sku] = [];
    result[r.kit_sku].push({ component_sku: r.component_sku, cantidad: r.cantidad });
  }
  return result;
}

// Reemplaza la definición de un kit (elimina anteriores y guarda los nuevos)
export async function saveKit(
  storeId: string,
  kitSku: string,
  components: KitComponent[],
): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM kits WHERE store_id = ${storeId} AND kit_sku = ${kitSku}`;
  for (const c of components) {
    if (!c.component_sku || c.cantidad <= 0) continue;
    await sql`
      INSERT INTO kits (store_id, kit_sku, component_sku, cantidad)
      VALUES (${storeId}, ${kitSku}, ${c.component_sku}, ${c.cantidad})
      ON CONFLICT (store_id, kit_sku, component_sku)
      DO UPDATE SET cantidad = ${c.cantidad}
    `;
  }
}

export async function deleteKit(storeId: string, kitSku: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM kits WHERE store_id = ${storeId} AND kit_sku = ${kitSku}`;
}

// ─── Deducción (con expansión de kits) ───────────────────────────────────────

export async function deducirStock(
  storeId: string,
  items: DeducirItem[],
): Promise<DeducirResult> {
  if (!items.length) return { insuficiente: [] };

  const sql = getDb();

  // 1. Obtener mapa de kits de la tienda
  const kitMap = await getAllKits(storeId);

  // 2. Expandir items: si un SKU es un kit, reemplazarlo por sus componentes
  const expanded = new Map<string, { nombre: string; cantidad: number }>();
  for (const item of items) {
    const components = kitMap[item.sku];
    if (components && components.length > 0) {
      // Es un kit → descontar componentes
      for (const comp of components) {
        const prev = expanded.get(comp.component_sku) ?? { nombre: comp.component_sku, cantidad: 0 };
        prev.cantidad += comp.cantidad * item.cantidad;
        expanded.set(comp.component_sku, prev);
      }
    } else {
      // SKU simple
      const prev = expanded.get(item.sku) ?? { nombre: item.nombre, cantidad: 0 };
      prev.cantidad += item.cantidad;
      expanded.set(item.sku, prev);
    }
  }

  // 3. Verificar stock disponible
  const skus = Array.from(expanded.keys());
  const current = await sql`
    SELECT sku, cantidad FROM stock
    WHERE store_id = ${storeId} AND sku = ANY(${skus})
  `;
  const stockMap = new Map(
    (current as { sku: string; cantidad: number }[]).map(r => [r.sku, r.cantidad])
  );

  const insuficiente: DeducirResult["insuficiente"] = [];
  for (const [sku, v] of expanded) {
    const disponible = stockMap.get(sku) ?? 0;
    if (disponible < v.cantidad) {
      insuficiente.push({ sku, nombre: v.nombre, disponible, solicitado: v.cantidad });
    }
  }

  // 4. Descontar (permite stock negativo, solo avisa)
  const motivo = items[0]?.motivo ?? "Exportación";
  for (const [sku, v] of expanded) {
    await sql`
      INSERT INTO stock (store_id, sku, nombre, cantidad, updated_at)
      VALUES (${storeId}, ${sku}, ${v.nombre}, 0, NOW())
      ON CONFLICT (store_id, sku) DO NOTHING
    `;
    await sql`
      UPDATE stock
      SET cantidad = cantidad - ${v.cantidad}, updated_at = NOW()
      WHERE store_id = ${storeId} AND sku = ${sku}
    `;
    await sql`
      INSERT INTO movimientos (store_id, sku, cantidad, motivo, created_at)
      VALUES (${storeId}, ${sku}, ${-v.cantidad}, ${motivo}, NOW())
    `;
  }

  return { insuficiente };
}

// ─── Ajuste manual ────────────────────────────────────────────────────────────

export async function ajustarStock(
  storeId: string, sku: string, nombre: string, delta: number, motivo: string,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO stock (store_id, sku, nombre, cantidad, updated_at)
    VALUES (${storeId}, ${sku}, ${nombre}, ${Math.max(0, delta)}, NOW())
    ON CONFLICT (store_id, sku)
    DO UPDATE SET cantidad = stock.cantidad + ${delta}, updated_at = NOW()
  `;
  await sql`
    INSERT INTO movimientos (store_id, sku, cantidad, motivo, created_at)
    VALUES (${storeId}, ${sku}, ${delta}, ${motivo}, NOW())
  `;
}

// ─── Historial ────────────────────────────────────────────────────────────────

export async function getMovimientos(storeId: string, limit = 200): Promise<Movimiento[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, sku, cantidad, motivo, created_at
    FROM movimientos
    WHERE store_id = ${storeId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as Movimiento[];
}
