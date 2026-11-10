// Prueba contra la base de STAGING de Neon (nunca contra producción).
// Corre con: npm run test:inventario:staging
//
// Verifica lo que PGlite no puede: transacciones reales sobre Neon y
// concurrencia con varias conexiones a la vez. Todo se escribe bajo un
// store_id falso y se borra al terminar; no toca los datos copiados.
import assert from "node:assert/strict";
import { conTransaccion, cerrarConexiones } from "../lib/inventarioTx";
import {
  migrarInventario, aplicar, reservarPedido, despacharPedido, registrarRecepcion, getDisponibilidad, Queryable,
} from "../lib/inventario";

const URL_STAGING = process.env.STAGING_DATABASE_URL;
if (!URL_STAGING) throw new Error("Falta STAGING_DATABASE_URL en .env.local");
if (URL_STAGING === process.env.DATABASE_URL) throw new Error("STAGING_DATABASE_URL es igual a DATABASE_URL: se aborta para no tocar producción");

const S = "QA-STAGING-INV";
const tx = <T>(fn: (db: Queryable) => Promise<T>) => conTransaccion(fn, URL_STAGING);
const ped = (n: string) => ({ storeId: S, canal: "tiendanube", numeroOrden: n });

async function limpiar() {
  await tx(async db => {
    for (const t of ["reservas", "movimientos", "stock", "kits"]) {
      const existe = await db.query(`SELECT to_regclass($1) AS t`, [`public.${t}`]);
      if (existe.rows[0].t) await db.query(`DELETE FROM ${t} WHERE store_id = $1`, [S]);
    }
  });
}
async function estado(sku: string) {
  const d = (await tx(db => getDisponibilidad(db, S))).find(x => x.sku === sku);
  assert.ok(d, `no existe ${sku}`);
  return d!;
}
async function paso(nombre: string, fn: () => Promise<void>) {
  await fn();
  console.log("  ok -", nombre);
}

async function main() {
  const host = URL_STAGING!.match(/@([^/?]+)/)?.[1];
  console.log("Staging:", host);
  await limpiar();

  await paso("la migración corre dos veces sin error (idempotente)", async () => {
    await tx(db => migrarInventario(db));
    await tx(db => migrarInventario(db));
  });

  await tx(async db => {
    await db.query(`INSERT INTO stock (store_id, sku, nombre, cantidad) VALUES ($1,'QA-ABD','QA-ABD',100),($1,'QA-GLU','QA-GLU',100)`, [S]);
    await db.query(`INSERT INTO kits (store_id, kit_sku, component_sku, cantidad) VALUES ($1,'QA-COMBO','QA-ABD',1),($1,'QA-COMBO','QA-GLU',1)`, [S]);
  });

  await paso("combo: reservar y despachar descuenta una sola vez cada componente", async () => {
    await tx(db => reservarPedido(db, { ...ped("A1"), items: [{ sku: "QA-COMBO", cantidad: 2 }] }));
    assert.equal((await estado("QA-ABD")).reservado, 2);
    await tx(db => despacharPedido(db, { ...ped("A1"), items: [{ sku: "QA-COMBO", cantidad: 2 }] }));
    const a = await estado("QA-ABD"), g = await estado("QA-GLU");
    assert.deepEqual([a.fisico, a.reservado, g.fisico, g.reservado], [98, 0, 98, 0]);
  });

  await paso("ROLLBACK real: si una operación falla, no queda nada a medias", async () => {
    await assert.rejects(tx(async db => {
      await registrarRecepcion(db, { storeId: S, sku: "QA-ABD", cantidad: 50, referencia: "R", eventId: "qa:rollback:1" });
      await aplicar(db, { storeId: S, sku: "QA-ABD", dReservado: -5, evento: "liberacion", eventId: "qa:rollback:2" });
    }), /negativo/);
    assert.equal((await estado("QA-ABD")).fisico, 98, "la recepción previa se revirtió");
    const n = await tx(db => db.query(`SELECT COUNT(*)::int AS n FROM movimientos WHERE store_id = $1 AND event_id LIKE 'qa:rollback:%'`, [S]));
    assert.equal(Number(n.rows[0].n), 0);
  });

  await paso("CONCURRENCIA: 6 despachos simultáneos del mismo pedido descuentan UNA sola vez", async () => {
    await tx(db => reservarPedido(db, { ...ped("C1"), items: [{ sku: "QA-ABD", cantidad: 3 }] }));
    const r = await Promise.all(Array.from({ length: 6 }, () =>
      tx(db => despacharPedido(db, { ...ped("C1"), items: [{ sku: "QA-ABD", cantidad: 3 }] })).then(x => ({ ok: true as const, x }), e => ({ ok: false as const, e }))));
    const errores = r.filter(x => !x.ok);
    assert.equal(errores.length, 0, `no debería fallar ninguno: ${errores.map(e => (e as { e: Error }).e.message).join(" | ")}`);
    const efectivos = r.filter(x => x.ok && (x as { x: { despachados: string[] } }).x.despachados.length > 0).length;
    assert.equal(efectivos, 1, "un solo despacho efectivo");
    const a = await estado("QA-ABD");
    assert.deepEqual([a.fisico, a.reservado], [95, 0]);
  });

  await paso("CONCURRENCIA: 6 reservas simultáneas del mismo pedido reservan UNA sola vez", async () => {
    await Promise.all(Array.from({ length: 6 }, () => tx(db => reservarPedido(db, { ...ped("C2"), items: [{ sku: "QA-GLU", cantidad: 4 }] }))));
    assert.equal((await estado("QA-GLU")).reservado, 4);
  });

  await paso("CONCURRENCIA: 20 pedidos distintos a la vez sobre el mismo SKU no pierden actualizaciones", async () => {
    const antes = (await estado("QA-GLU")).reservado;
    await Promise.all(Array.from({ length: 20 }, (_, i) => tx(db => reservarPedido(db, { ...ped(`M${i}`), items: [{ sku: "QA-GLU", cantidad: 1 }] }))));
    assert.equal((await estado("QA-GLU")).reservado, antes + 20);
  });

  await paso("CONCURRENCIA: la misma recepción (mismo eventId) 8 veces a la vez suma UNA sola vez", async () => {
    const antes = (await estado("QA-ABD")).fisico;
    const r = await Promise.all(Array.from({ length: 8 }, () =>
      tx(db => registrarRecepcion(db, { storeId: S, sku: "QA-ABD", cantidad: 36, referencia: "DHL-X", eventId: "qa:recepcion:dhl-x:caja1" }))));
    assert.equal(r.filter(x => x.aplicado).length, 1);
    assert.equal((await estado("QA-ABD")).fisico, antes + 36);
  });

  await paso("el stock real copiado en staging no se tocó", async () => {
    const n = await tx(db => db.query(`SELECT COUNT(*)::int AS n FROM stock WHERE store_id <> $1`, [S]));
    assert.ok(Number(n.rows[0].n) > 0);
  });
}

main()
  .then(async () => { console.log("OK: todo verificado contra Neon (staging)"); })
  .catch(e => { console.error("FALLÓ:", e); process.exitCode = 1; })
  .finally(async () => {
    try { await limpiar(); console.log("limpieza: store de prueba borrado"); } catch (e) { console.error("no se pudo limpiar:", e); }
    await cerrarConexiones();
  });
