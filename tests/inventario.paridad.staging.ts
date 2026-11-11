// Paridad entre el descuento de stock de SIEMPRE (deducirStock) y el motor
// nuevo (despacharPedido), más un escaneo completo de Despacho con el motor
// nuevo prendido. Corre SOLO contra la base de staging de Neon.
//   npm run test:inventario:paridad
//
// Importante: se apunta DATABASE_URL a staging ANTES de usar cualquier función
// de la app, para que el código "de siempre" (driver HTTP) también escriba en
// staging y nunca en producción.
import assert from "node:assert/strict";

const URL_STAGING = process.env.STAGING_DATABASE_URL;
const URL_PROD = process.env.DATABASE_URL;
if (!URL_STAGING) throw new Error("Falta STAGING_DATABASE_URL en .env.local");
if (URL_STAGING === URL_PROD) throw new Error("STAGING_DATABASE_URL es igual a DATABASE_URL: se aborta para no tocar producción");
process.env.DATABASE_URL = URL_STAGING;
process.env.INVENTARIO_V2 = "1";

async function main() {
  const { getDb } = await import("../lib/db");
  const { conTransaccion, cerrarConexiones } = await import("../lib/inventarioTx");
  const { migrarInventario, despacharPedido } = await import("../lib/inventario");
  const { deducirStock, initStockTables } = await import("../lib/stockDb");
  const { initDespachoTables, upsertEnvioTracking, procesarEscaneo, descontarStockV2 } = await import("../lib/despachoDb");
  const sql = getDb();

  const A = "QA-PARIDAD-ACTUAL", B = "QA-PARIDAD-NUEVO", E2E_ORDEN = "13196";
  const limpiar = async () => {
    for (const t of ["reservas", "movimientos", "stock", "kits", "pedidos_procesados"]) {
      const ex = await sql.query(`SELECT to_regclass($1) AS t`, [`public.${t}`]) as { t: string | null }[];
      if (ex[0].t) await sql.query(`DELETE FROM ${t} WHERE store_id = ANY($1)`, [[A, B]]);
    }
  };
  const sembrar = async (store: string) => {
    await sql`INSERT INTO stock (store_id, sku, nombre, cantidad) VALUES
      (${store}, 'QA-ABD', 'Abdomen', 50), (${store}, 'QA-BRA', 'Brazos', 50), (${store}, 'QA-GLU', 'Gluteos', 50)`;
    await sql`INSERT INTO kits (store_id, kit_sku, component_sku, cantidad) VALUES
      (${store}, 'QA-COMBO', 'QA-BRA', 1), (${store}, 'QA-COMBO', 'QA-GLU', 1),
      (${store}, 'QA-GA', 'QA-ABD', 1), (${store}, 'QA-GA', 'QA-GLU', 1)`;
  };
  // Estado comparable: stock por SKU y movimientos sumados por (sku, tipo, canal).
  const foto = async (store: string) => ({
    stock: (await sql`SELECT sku, nombre, cantidad FROM stock WHERE store_id = ${store} ORDER BY sku`) as unknown[],
    movs: (await sql`SELECT sku, tipo, canal, SUM(cantidad)::int AS total, string_agg(DISTINCT motivo, ' | ' ORDER BY motivo) AS motivos
                       FROM movimientos WHERE store_id = ${store} GROUP BY sku, tipo, canal ORDER BY sku, tipo, canal`) as unknown[],
  });

  type Esc = { nombre: string; canal: "tiendanube" | "mercadolibre"; esVenta: boolean; ordenes: Record<string, { sku: string; nombre: string; cantidad: number }[]> };
  const escenarios: Esc[] = [
    { nombre: "SKU simple", canal: "tiendanube", esVenta: true, ordenes: { "1001": [{ sku: "QA-ABD", nombre: "Abdomen", cantidad: 1 }] } },
    { nombre: "combo x2", canal: "tiendanube", esVenta: true, ordenes: { "1002": [{ sku: "QA-COMBO", nombre: "Combo", cantidad: 2 }] } },
    { nombre: "combo que comparte componente con otro combo + simple repetido", canal: "tiendanube", esVenta: true,
      ordenes: { "1003": [{ sku: "QA-COMBO", nombre: "Combo", cantidad: 1 }, { sku: "QA-GA", nombre: "Combo GA", cantidad: 1 }, { sku: "QA-GLU", nombre: "Gluteos", cantidad: 1 }, { sku: "QA-GLU", nombre: "Gluteos", cantidad: 2 }] } },
    { nombre: "SKU inexistente (queda negativo y se crea con el nombre del producto)", canal: "tiendanube", esVenta: true,
      ordenes: { "1004": [{ sku: "QA-NUEVO", nombre: "Producto nuevo", cantidad: 3 }] } },
    { nombre: "stock insuficiente (queda negativo, no bloquea)", canal: "tiendanube", esVenta: true, ordenes: { "1005": [{ sku: "QA-ABD", nombre: "Abdomen", cantidad: 80 }] } },
    { nombre: "Cambio (ajuste, no venta)", canal: "tiendanube", esVenta: false, ordenes: { "CAMBIO-7": [{ sku: "QA-BRA", nombre: "QA-BRA", cantidad: 1 }] } },
    { nombre: "Mercado Libre", canal: "mercadolibre", esVenta: true, ordenes: { "2000001": [{ sku: "QA-COMBO", nombre: "Combo", cantidad: 1 }] } },
    { nombre: "envío combinado de 2 pedidos", canal: "tiendanube", esVenta: true,
      ordenes: { "1006": [{ sku: "QA-ABD", nombre: "Abdomen", cantidad: 1 }], "1007": [{ sku: "QA-ABD", nombre: "Abdomen", cantidad: 2 }, { sku: "QA-COMBO", nombre: "Combo", cantidad: 1 }] } },
  ];
  const motivoDe = (e: Esc, o: string) => (e.nombre.startsWith("Cambio") ? `Despacho Cambio ${o}` : e.canal === "mercadolibre" ? `Venta ML #${o} (despacho)` : `Venta TN #${o} (despacho)`);

  try {
    await initStockTables();
    await conTransaccion(db => migrarInventario(db), URL_STAGING);
    await limpiar();

    for (const e of escenarios) {
      await limpiar();
      await sembrar(A); await sembrar(B);

      // camino de SIEMPRE: un solo deducirStock con todas las líneas del paquete
      await deducirStock(A, Object.entries(e.ordenes).flatMap(([o, items]) => items.map(i => ({ ...i, motivo: motivoDe(e, o), numeroOrden: o }))), e.canal, e.esVenta ? "venta" : "ajuste");
      // motor NUEVO: un despacho por pedido, todo en una transacción
      await conTransaccion(async db => {
        for (const [o, items] of Object.entries(e.ordenes)) {
          await despacharPedido(db, { storeId: B, canal: e.canal, numeroOrden: o, items, esVenta: e.esVenta, motivo: motivoDe(e, o) });
        }
      }, URL_STAGING);

      const fa = await foto(A), fb = await foto(B);
      assert.deepEqual(fb.stock, fa.stock, `[${e.nombre}] el stock final difiere`);
      const sinMotivo = (m: unknown[]) => m.map(x => { const { motivos, ...resto } = x as Record<string, unknown>; void motivos; return resto; });
      assert.deepEqual(sinMotivo(fb.movs), sinMotivo(fa.movs), `[${e.nombre}] los totales del historial difieren`);
      if (Object.keys(e.ordenes).length === 1) {
        assert.deepEqual(fb.movs, fa.movs, `[${e.nombre}] el historial (con textos) difiere`);
      } else {
        // Diferencia buscada: el sistema de siempre rotula TODOS los movimientos de un envío combinado con el
        // pedido principal; el motor nuevo rotula cada uno con el pedido del que realmente sale el producto.
        const bra = (fb.movs as { sku: string; motivos: string }[]).find(m => m.sku === "QA-BRA");
        assert.equal(bra?.motivos, "Venta TN #1007 (despacho)", "QA-BRA sale del pedido 1007 y así debe figurar");
      }
      console.log("  ok -", e.nombre);
    }


    // ── Camino de seguridad: si el motor nuevo falla SIN dejar rastro, devuelve false para que se use el de siempre ──
    await limpiar();
    await sembrar(B);
    const envioFalso = { store_id: B, numero_orden: "9999" } as Parameters<typeof descontarStockV2>[0];
    const pedidoInvalido = { origenTipo: "tienda_nube", productos: [{ sku: "QA-ABD", nombre: "x", cantidad: 0 }] } as unknown as Parameters<typeof descontarStockV2>[1];
    assert.equal(await descontarStockV2(envioFalso, pedidoInvalido, "QA"), false, "ante un fallo sin rastro debe devolver false");
    const intacto = (await sql`SELECT cantidad FROM stock WHERE store_id = ${B} AND sku = 'QA-ABD'`) as { cantidad: number }[];
    assert.equal(intacto[0].cantidad, 50, "no se tocó el stock");
    const pedidoValido = { origenTipo: "tienda_nube", productos: [{ sku: "QA-ABD", nombre: "x", cantidad: 2 }] } as unknown as Parameters<typeof descontarStockV2>[1];
    assert.equal(await descontarStockV2(envioFalso, pedidoValido, "QA"), true);
    assert.equal(((await sql`SELECT cantidad FROM stock WHERE store_id = ${B} AND sku = 'QA-ABD'`) as { cantidad: number }[])[0].cantidad, 48);
    console.log("  ok - si el motor nuevo falla sin rastro, devuelve false y no toca nada (cae al camino de siempre)");

    // ── Escaneo completo de Despacho con el motor nuevo (pedido real de TN, solo lectura) ──
    await limpiar();
    const tienda = (await sql`SELECT store_id FROM tn_conexiones LIMIT 1`) as { store_id: string }[];
    const REAL = tienda[0].store_id; // la tienda real copiada en staging: solo se lee la orden de TN
    const antes = (await sql`SELECT sku, cantidad FROM stock WHERE store_id = ${REAL} ORDER BY sku`) as { sku: string; cantidad: number }[];
    const TRACK = "QA-PARIDAD-TRACK-1";
    await initDespachoTables();
    await upsertEnvioTracking({ storeId: REAL, numeroOrden: E2E_ORDEN, trackingNumber: TRACK, carrier: "andreani", createdBy: "QA" });
    try {
      const r1 = await procesarEscaneo(TRACK, "QA-paridad");
      assert.equal(r1.ok, true, `el escaneo debería salir OK: ${JSON.stringify(r1).slice(0, 300)}`);
      const evs = (await sql`SELECT sku, cantidad, evento, tipo, motivo FROM movimientos WHERE store_id = ${REAL} AND event_id LIKE ${`despacho:tiendanube:${E2E_ORDEN}:%`} ORDER BY sku`) as { sku: string; cantidad: number; evento: string; tipo: string; motivo: string }[];
      assert.ok(evs.length > 0, "el motor nuevo debió registrar movimientos con event_id");
      assert.ok(evs.every(x => x.evento === "despacho" && x.tipo === "venta" && x.motivo === `Venta TN #${E2E_ORDEN} (despacho)` && x.cantidad < 0));
      console.log("  ok - escaneo completo por Despacho con el motor nuevo:", evs.map(x => `${x.sku} ${x.cantidad}`).join(", "));

      const r2 = await procesarEscaneo(TRACK, "QA-paridad");
      assert.equal(r2.ok, false); assert.equal((r2 as { errorCode?: string }).errorCode, "ALREADY_DISPATCHED");
      const n = (await sql`SELECT COUNT(*)::int AS n FROM movimientos WHERE store_id = ${REAL} AND event_id LIKE ${`despacho:tiendanube:${E2E_ORDEN}:%`}`) as { n: number }[];
      assert.equal(n[0].n, evs.length, "el segundo escaneo no movió stock");
      console.log("  ok - un segundo escaneo del mismo paquete se rechaza y no mueve stock");
    } finally {
      // Deja staging como estaba: borra los rastros del escaneo y restaura las cantidades
      await sql`DELETE FROM movimientos WHERE store_id = ${REAL} AND event_id LIKE ${`despacho:tiendanube:${E2E_ORDEN}:%`}`;
      await sql`DELETE FROM dispatch_scans WHERE tracking_number = ${TRACK}`;
      await sql`DELETE FROM envios_tracking WHERE tracking_number = ${TRACK}`;
      for (const s of antes) await sql`UPDATE stock SET cantidad = ${s.cantidad}, reservado = 0 WHERE store_id = ${REAL} AND sku = ${s.sku}`;
      const despues = (await sql`SELECT sku, cantidad FROM stock WHERE store_id = ${REAL} ORDER BY sku`) as { sku: string; cantidad: number }[];
      assert.deepEqual(despues, antes, "staging quedó con el stock original");
    }
  } finally {
    await limpiar();
    await cerrarConexiones();
  }
}

main().then(() => console.log("OK: paridad verificada contra Neon (staging)")).catch(e => { console.error("FALLÓ:", e); process.exitCode = 1; });
