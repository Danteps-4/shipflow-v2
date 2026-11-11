// Recepción de Importaciones: comparación entre la confirmación de siempre y la
// nueva (una sola transacción), más concurrencia real. SOLO contra staging.
//   npm run test:importaciones:staging
import assert from "node:assert/strict";

const URL_STAGING = process.env.STAGING_DATABASE_URL;
if (!URL_STAGING) throw new Error("Falta STAGING_DATABASE_URL en .env.local");
if (URL_STAGING === process.env.DATABASE_URL) throw new Error("STAGING_DATABASE_URL es igual a DATABASE_URL: se aborta para no tocar producción");
process.env.DATABASE_URL = URL_STAGING; // todo el código de la app apunta a staging

async function main() {
  const { getDb } = await import("../lib/db");
  const { cerrarConexiones } = await import("../lib/inventarioTx");
  const { initStockTables } = await import("../lib/stockDb");
  const { initImportacionesTables, crearCompra, confirmarCaja } = await import("../lib/importacionesDb");
  const sql = getDb();

  const A = "QA-IMP-ACTUAL", B = "QA-IMP-NUEVO", C = "QA-IMP-CONC";
  const limpiar = async () => {
    await sql`DELETE FROM recepcion_escaneos WHERE compra_id IN (SELECT id FROM compras_importacion WHERE store_id = ANY(${[A, B, C]}))`;
    await sql`DELETE FROM compras_importacion_lineas WHERE compra_id IN (SELECT id FROM compras_importacion WHERE store_id = ANY(${[A, B, C]}))`;
    await sql`DELETE FROM compras_importacion WHERE store_id = ANY(${[A, B, C]})`;
    await sql`DELETE FROM movimientos WHERE store_id = ANY(${[A, B, C]})`;
    await sql`DELETE FROM stock WHERE store_id = ANY(${[A, B, C]})`;
  };
  const nuevaCompra = (store: string, tracking: string, esperada: number) => crearCompra({
    storeId: store, fechaCompra: "2026-11-01", trackingNumber: tracking, createdBy: "QA",
    lineas: [{ sku: "QA-IMP-SKU", nombre: "Producto QA importado", cantidadEsperada: esperada, unidadesPorCaja: 36 }],
  });
  const estado = async (store: string, compraId: number) => ({
    linea: ((await sql`SELECT cantidad_recibida FROM compras_importacion_lineas WHERE compra_id = ${compraId}`) as { cantidad_recibida: number }[])[0].cantidad_recibida,
    llegadaMarcada: ((await sql`SELECT fecha_llegada_real IS NOT NULL AS m FROM compras_importacion WHERE id = ${compraId}`) as { m: boolean }[])[0].m,
    escaneos: ((await sql`SELECT COUNT(*)::int AS n FROM recepcion_escaneos WHERE compra_id = ${compraId}`) as { n: number }[])[0].n,
    stock: await sql`SELECT sku, nombre, cantidad FROM stock WHERE store_id = ${store} ORDER BY sku`,
    movs: await sql`SELECT sku, cantidad, tipo, canal, regexp_replace(regexp_replace(motivo, 'tracking [^)]*', 'tracking X'), '#[0-9]+', '#N') AS motivo
                      FROM movimientos WHERE store_id = ${store} ORDER BY id`,
  });

  try {
    await initStockTables();
    await initImportacionesTables();
    await limpiar();

    // ── Misma recepción (2 cajas de 36) con el camino de siempre y con el nuevo ──
    const pA = await nuevaCompra(A, "QA-IMP-TRK-A", 72);
    const pB = await nuevaCompra(B, "QA-IMP-TRK-B", 72);
    process.env.INVENTARIO_V2 = "0";
    const r1A = await confirmarCaja({ compraId: pA.id, lineaId: pA.lineas[0].id, cantidad: 36, trackingNumberEscaneado: "QA-IMP-TRK-A", scannedBy: "QA" });
    const r2A = await confirmarCaja({ compraId: pA.id, lineaId: pA.lineas[0].id, cantidad: 36, trackingNumberEscaneado: "QA-IMP-TRK-A", scannedBy: "QA" });
    process.env.INVENTARIO_V2 = "1";
    const r1B = await confirmarCaja({ compraId: pB.id, lineaId: pB.lineas[0].id, cantidad: 36, trackingNumberEscaneado: "QA-IMP-TRK-B", scannedBy: "QA" });
    const r2B = await confirmarCaja({ compraId: pB.id, lineaId: pB.lineas[0].id, cantidad: 36, trackingNumberEscaneado: "QA-IMP-TRK-B", scannedBy: "QA" });

    assert.deepEqual([r1A.compraCompleta, r2A.compraCompleta], [false, true]);
    assert.deepEqual([r1B.compraCompleta, r2B.compraCompleta], [false, true], "el cierre de la compra coincide");
    assert.equal(r2B.linea.cantidad_recibida, 72);
    assert.equal(r1B.escaneo.cantidad, 36);
    const eA = await estado(A, pA.id), eB = await estado(B, pB.id);
    try { assert.deepEqual(eB, eA, "el estado final (línea, escaneos, stock, historial) es idéntico"); }
    catch (err) { console.log("DE SIEMPRE:", JSON.stringify(eA)); console.log("NUEVO:     ", JSON.stringify(eB)); throw err; }
    console.log("  ok - 2 cajas: mismo resultado con el camino de siempre y con el nuevo");

    const ev = await sql`SELECT COUNT(*)::int AS n FROM movimientos WHERE store_id = ${B} AND event_id LIKE 'recepcion:importacion:%' AND evento = 'recepcion'` as { n: number }[];
    assert.equal(ev[0].n, 2, "el motor nuevo dejó un event_id por caja");
    console.log("  ok - el motor nuevo registró cada caja con su event_id");

    // ── Línea inexistente: error claro y nada escrito ──
    await assert.rejects(confirmarCaja({ compraId: pB.id, lineaId: 99999999, cantidad: 1, trackingNumberEscaneado: "X", scannedBy: "QA" }), /Línea de compra no encontrada/);
    assert.deepEqual(await estado(B, pB.id), eB, "no se escribió nada");
    console.log("  ok - una línea inexistente da error y no escribe nada");

    // ── Concurrencia real: 6 cajas confirmadas a la vez sobre la misma línea ──
    const pC = await nuevaCompra(C, "QA-IMP-TRK-C", 72);
    const rs = await Promise.all(Array.from({ length: 6 }, () =>
      confirmarCaja({ compraId: pC.id, lineaId: pC.lineas[0].id, cantidad: 12, trackingNumberEscaneado: "QA-IMP-TRK-C", scannedBy: "QA" })));
    const eC = await estado(C, pC.id);
    assert.equal(eC.linea, 72);
    assert.equal(eC.escaneos, 6);
    assert.deepEqual((eC.stock as { cantidad: number }[])[0].cantidad, 72, "el stock sumó exactamente 72");
    assert.equal(eC.llegadaMarcada, true);
    assert.equal(rs.filter(r => r.compraCompleta).length >= 1, true);
    console.log("  ok - 6 cajas simultáneas: línea 72, 6 escaneos, stock +72 exacto, compra cerrada");
  } finally {
    await limpiar();
    const resto = await sql`SELECT (SELECT COUNT(*) FROM compras_importacion WHERE store_id = ANY(${[A, B, C]}))::int AS c, (SELECT COUNT(*) FROM stock WHERE store_id = ANY(${[A, B, C]}))::int AS s` as { c: number; s: number }[];
    assert.deepEqual(resto[0], { c: 0, s: 0 });
    await cerrarConexiones();
  }
}

main().then(() => console.log("OK: recepción de Importaciones verificada contra Neon (staging)")).catch(e => { console.error("FALLÓ:", e); process.exitCode = 1; });
