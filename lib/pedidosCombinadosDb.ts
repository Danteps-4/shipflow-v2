import { getDb } from "./db";
import type { ProductoOrden } from "@/types/orders";

// Envíos que combinan varios pedidos del mismo cliente en un solo paquete
// (se paga un solo envío). Se guarda al descargar el Excel de Andreani desde
// /procesar y se consulta después: al poner el SKU en las etiquetas, al subir
// el tracking (se manda a todos los pedidos del paquete) y al escanear en
// Despacho (se descuenta el stock de todos).

export interface PedidoSecundario {
  numeroOrden: string;
  // Foto de los productos al momento de combinar (respaldo si Tienda Nube no
  // responde al momento de usarla).
  productos: ProductoOrden[];
}

let combinadosInicializado = false;

export async function initPedidosCombinadosTables(): Promise<void> {
  if (combinadosInicializado) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS pedidos_combinados (
      id                SERIAL PRIMARY KEY,
      store_id          TEXT NOT NULL,
      numero_principal  TEXT NOT NULL,
      numero_secundario TEXT NOT NULL,
      productos         JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by        TEXT NOT NULL DEFAULT '',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Un pedido secundario viaja siempre en un solo paquete.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS pedidos_combinados_secundario_uidx
    ON pedidos_combinados (store_id, numero_secundario)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS pedidos_combinados_principal_idx
    ON pedidos_combinados (store_id, numero_principal)
  `;
  combinadosInicializado = true;
}

export interface GrupoCombinado {
  principal: string;
  secundarias: PedidoSecundario[];
}

// Reemplaza lo guardado para los pedidos de esta exportación: primero borra
// cualquier combinación previa que los involucre (como principal o como
// secundario — cubre el caso de deshacer una combinación y volver a
// exportar) y después guarda las vigentes.
export async function reemplazarCombinados(
  storeId: string, exportados: string[], grupos: GrupoCombinado[], createdBy: string,
): Promise<void> {
  const sql = getDb();
  const numeros = Array.from(new Set([
    ...exportados,
    ...grupos.flatMap(g => [g.principal, ...g.secundarias.map(s => s.numeroOrden)]),
  ]));
  if (numeros.length) {
    await sql`
      DELETE FROM pedidos_combinados
      WHERE store_id = ${storeId}
        AND (numero_principal = ANY(${numeros}) OR numero_secundario = ANY(${numeros}))
    `;
  }
  for (const g of grupos) {
    for (const s of g.secundarias) {
      if (s.numeroOrden === g.principal) continue;
      await sql`
        INSERT INTO pedidos_combinados (store_id, numero_principal, numero_secundario, productos, created_by)
        VALUES (${storeId}, ${g.principal}, ${s.numeroOrden}, ${JSON.stringify(s.productos)}::jsonb, ${createdBy})
      `;
    }
  }
}

export async function getSecundariasPorPrincipales(
  storeId: string, principales: string[],
): Promise<Record<string, PedidoSecundario[]>> {
  if (!principales.length) return {};
  const sql = getDb();
  const rows = await sql`
    SELECT numero_principal, numero_secundario, productos
    FROM pedidos_combinados
    WHERE store_id = ${storeId} AND numero_principal = ANY(${principales})
    ORDER BY id
  ` as { numero_principal: string; numero_secundario: string; productos: ProductoOrden[] }[];

  const out: Record<string, PedidoSecundario[]> = {};
  for (const r of rows) {
    (out[r.numero_principal] ??= []).push({ numeroOrden: r.numero_secundario, productos: r.productos ?? [] });
  }
  return out;
}

export async function getSecundarias(storeId: string, principal: string): Promise<PedidoSecundario[]> {
  return (await getSecundariasPorPrincipales(storeId, [principal]))[principal] ?? [];
}
