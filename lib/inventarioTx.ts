import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Queryable } from "./inventario";

// Transacciones reales (BEGIN/COMMIT) sobre Neon. El driver `neon()` por HTTP
// que usa el resto de la app no las soporta entre consultas separadas; esto
// usa el Pool por WebSocket del mismo paquete, que en Node necesita `ws`.
neonConfig.webSocketConstructor = ws;

const pools = new Map<string, Pool>();

function getPool(connectionString: string): Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({ connectionString, max: 5 });
    pools.set(connectionString, pool);
  }
  return pool;
}

// Ejecuta `fn` dentro de una transacción: si lanza, se hace ROLLBACK y no
// queda ningún cambio a medias. Por defecto usa DATABASE_URL; los scripts de
// prueba pasan explícitamente la URL de staging.
export async function conTransaccion<T>(
  fn: (db: Queryable) => Promise<T>,
  connectionString: string | undefined = process.env.DATABASE_URL,
): Promise<T> {
  if (!connectionString) throw new Error("No hay cadena de conexión: DATABASE_URL no está configurada.");
  const client = await getPool(connectionString).connect();
  try {
    await client.query("BEGIN");
    const resultado = await fn(client as unknown as Queryable);
    await client.query("COMMIT");
    return resultado;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* la conexión ya cayó: nada más que hacer */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function cerrarConexiones(): Promise<void> {
  await Promise.all([...pools.values()].map(p => p.end()));
  pools.clear();
}
