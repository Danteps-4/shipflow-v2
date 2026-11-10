// Corre con: npm run test:inventario
// Usa PGlite (Postgres real en memoria): no toca ninguna base de Neon.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  Queryable, migrarInventario, aplicar, reservarPedido, liberarReserva, despacharPedido,
  registrarRecepcion, ingresarDevolucion, moverEntreEstados, getDisponibilidad, expandirAComponentes,
} from "../lib/inventario";

const S = "TIENDA-TEST";

// Esquema ACTUAL de producción (lib/stockDb.ts), antes de la migración nueva.
const ESQUEMA_ACTUAL = `
  CREATE TABLE stock (
    store_id TEXT NOT NULL, sku TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '',
    cantidad INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    destacado BOOLEAN NOT NULL DEFAULT false, importado BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (store_id, sku)
  );
  CREATE TABLE movimientos (
    id SERIAL PRIMARY KEY, store_id TEXT NOT NULL, sku TEXT NOT NULL, cantidad INTEGER NOT NULL,
    motivo TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    canal TEXT NOT NULL DEFAULT 'tiendanube', tipo TEXT NOT NULL DEFAULT 'ajuste'
  );
  CREATE TABLE kits (
    store_id TEXT NOT NULL, kit_sku TEXT NOT NULL, component_sku TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (store_id, kit_sku, component_sku)
  );
`;

let pg: PGlite;

async function stockInicial(sku: string, cantidad: number) {
  await pg.query(`INSERT INTO stock (store_id, sku, nombre, cantidad) VALUES ($1,$2,$2,$3)`, [S, sku, cantidad]);
}
async function kit(kitSku: string, comps: [string, number][]) {
  for (const [c, n] of comps) await pg.query(`INSERT INTO kits (store_id, kit_sku, component_sku, cantidad) VALUES ($1,$2,$3,$4)`, [S, kitSku, c, n]);
}
async function estado(sku: string) {
  const d = (await getDisponibilidad(pg as unknown as Queryable, S)).find(x => x.sku === sku);
  assert.ok(d, `no existe ${sku}`);
  return d!;
}
const tx = <T>(fn: (db: Queryable) => Promise<T>) => pg.transaction(t => fn(t as unknown as Queryable));
const pedido = (n: string) => ({ storeId: S, canal: "tiendanube", numeroOrden: n });

async function preparar() {
  pg = new PGlite();
  await pg.exec(ESQUEMA_ACTUAL);
  await migrarInventario(pg as unknown as Queryable);
  await stockInicial("ABDOMEN", 100);
  await stockInicial("ABDOMEN-BRAZOS", 100);
  await stockInicial("GLUTEOS", 100);
  await kit("ABDOMEN-BRAZOS-GLUTEOS", [["ABDOMEN-BRAZOS", 1], ["GLUTEOS", 1]]);
  await kit("GLUTEOS-ABDOMEN", [["ABDOMEN", 1], ["GLUTEOS", 1]]);
}

describe("migración", () => {
  beforeEach(preparar); // base nueva y limpia antes de CADA caso
  it("es idempotente y no toca los datos existentes", async () => {
    await migrarInventario(pg as unknown as Queryable);
    await migrarInventario(pg as unknown as Queryable);
    assert.deepEqual(await estado("ABDOMEN"), { sku: "ABDOMEN", fisico: 100, reservado: 0, disponible: 100, defectuoso: 0, enRevision: 0 });
  });
});

describe("Casos de la especificación", () => {
  beforeEach(preparar); // base nueva y limpia antes de CADA caso
  it("Caso 1: venta individual — reserva y despacho de 1 ABDOMEN", async () => {
    await tx(db => reservarPedido(db, { ...pedido("1"), items: [{ sku: "ABDOMEN", cantidad: 1 }] }));
    assert.deepEqual(await estado("ABDOMEN"), { sku: "ABDOMEN", fisico: 100, reservado: 1, disponible: 99, defectuoso: 0, enRevision: 0 });
    await tx(db => despacharPedido(db, { ...pedido("1"), items: [{ sku: "ABDOMEN", cantidad: 1 }] }));
    assert.deepEqual(await estado("ABDOMEN"), { sku: "ABDOMEN", fisico: 99, reservado: 0, disponible: 99, defectuoso: 0, enRevision: 0 });
  });

  it("Caso 2: combo ABDOMEN-BRAZOS-GLUTEOS consume ABDOMEN-BRAZOS + GLUTEOS y NO ABDOMEN", async () => {
    await tx(db => despacharPedido(db, { ...pedido("2"), items: [{ sku: "ABDOMEN-BRAZOS-GLUTEOS", cantidad: 1 }] }));
    assert.equal((await estado("ABDOMEN-BRAZOS")).fisico, 99);
    assert.equal((await estado("GLUTEOS")).fisico, 99);
    assert.equal((await estado("ABDOMEN")).fisico, 100);
  });

  it("Caso 3: combo GLUTEOS-ABDOMEN consume ABDOMEN + GLUTEOS", async () => {
    await tx(db => despacharPedido(db, { ...pedido("3"), items: [{ sku: "GLUTEOS-ABDOMEN", cantidad: 1 }] }));
    assert.equal((await estado("ABDOMEN")).fisico, 99);
    assert.equal((await estado("GLUTEOS")).fisico, 99);
    assert.equal((await estado("ABDOMEN-BRAZOS")).fisico, 100);
  });

  it("Caso 4: 2 combos completos consumen 2 de cada componente", async () => {
    await tx(db => despacharPedido(db, { ...pedido("4"), items: [{ sku: "ABDOMEN-BRAZOS-GLUTEOS", cantidad: 2 }] }));
    assert.equal((await estado("ABDOMEN-BRAZOS")).fisico, 98);
    assert.equal((await estado("GLUTEOS")).fisico, 98);
  });

  it("Caso 5: reservar dos veces el mismo pedido tiene un único efecto", async () => {
    const items = [{ sku: "ABDOMEN-BRAZOS-GLUTEOS", cantidad: 1 }];
    const a = await tx(db => reservarPedido(db, { ...pedido("5"), items }));
    const b = await tx(db => reservarPedido(db, { ...pedido("5"), items }));
    assert.deepEqual(a.reservados.sort(), ["ABDOMEN-BRAZOS", "GLUTEOS"]);
    assert.deepEqual(b.reservados, []);
    assert.deepEqual(b.omitidos.sort(), ["ABDOMEN-BRAZOS", "GLUTEOS"]);
    assert.equal((await estado("GLUTEOS")).reservado, 1);
  });

  it("Caso 6: reservar y luego despachar NO descuenta dos veces (y despachar de nuevo tampoco)", async () => {
    const items = [{ sku: "GLUTEOS", cantidad: 1 }];
    await tx(db => reservarPedido(db, { ...pedido("6"), items }));
    await tx(db => despacharPedido(db, { ...pedido("6"), items }));
    const r2 = await tx(db => despacharPedido(db, { ...pedido("6"), items }));
    assert.deepEqual(r2.despachados, []);
    assert.deepEqual(r2.omitidos, ["GLUTEOS"]);
    assert.deepEqual(await estado("GLUTEOS"), { sku: "GLUTEOS", fisico: 99, reservado: 0, disponible: 99, defectuoso: 0, enRevision: 0 });
  });

  it("Caso 7: cancelar antes del despacho libera la reserva (y cancelar de nuevo no hace nada)", async () => {
    await tx(db => reservarPedido(db, { ...pedido("7"), items: [{ sku: "ABDOMEN", cantidad: 3 }] }));
    assert.equal((await estado("ABDOMEN")).disponible, 97);
    assert.deepEqual(await tx(db => liberarReserva(db, pedido("7"))), ["ABDOMEN"]);
    assert.deepEqual(await tx(db => liberarReserva(db, pedido("7"))), []);
    assert.deepEqual(await estado("ABDOMEN"), { sku: "ABDOMEN", fisico: 100, reservado: 0, disponible: 100, defectuoso: 0, enRevision: 0 });
  });

  it("Caso 8: una devolución NO vuelve a ser vendible hasta que se verifica", async () => {
    await tx(db => ingresarDevolucion(db, { storeId: S, sku: "ABDOMEN", cantidad: 1, referencia: "DEV-1", eventId: "dev:1" }));
    let e = await estado("ABDOMEN");
    assert.equal(e.fisico, 100); assert.equal(e.disponible, 100); assert.equal(e.enRevision, 1);
    await tx(db => moverEntreEstados(db, { storeId: S, sku: "ABDOMEN", cantidad: 1, de: "revision", a: "apto", motivo: "Revisada OK" }));
    e = await estado("ABDOMEN");
    assert.equal(e.fisico, 101); assert.equal(e.enRevision, 0);
  });

  it("Caso 16: físico 216 con 180 reservados deja 36 disponibles", async () => {
    await pg.query(`UPDATE stock SET cantidad = 216 WHERE store_id = $1 AND sku = 'ABDOMEN'`, [S]);
    await tx(db => reservarPedido(db, { ...pedido("16"), items: [{ sku: "ABDOMEN", cantidad: 180 }] }));
    const e = await estado("ABDOMEN");
    assert.equal(e.fisico, 216); assert.equal(e.reservado, 180); assert.equal(e.disponible, 36);
  });
});

describe("Reglas del libro de movimientos", () => {
  beforeEach(preparar); // base nueva y limpia antes de CADA caso
  it("el mismo eventId no se aplica dos veces (recepción repetida / reintento)", async () => {
    const r = { storeId: S, sku: "ABDOMEN", cantidad: 36, referencia: "DHL-1", eventId: "recepcion:DHL-1:caja1" };
    assert.equal((await tx(db => registrarRecepcion(db, r))).aplicado, true);
    assert.equal((await tx(db => registrarRecepcion(db, r))).aplicado, false);
    assert.equal((await estado("ABDOMEN")).fisico, 136);
  });

  it("las ventas despachadas cuentan UNA vez en el reporte de ventas (tipo='venta'); reservas no", async () => {
    const items = [{ sku: "GLUTEOS", cantidad: 2 }];
    await tx(db => reservarPedido(db, { ...pedido("V"), items }));
    await tx(db => despacharPedido(db, { ...pedido("V"), items }));
    const v = await pg.query<{ u: string }>(`SELECT COALESCE(SUM(-cantidad),0) AS u FROM movimientos WHERE store_id = $1 AND tipo = 'venta'`, [S]);
    assert.equal(Number(v.rows[0].u), 2);
  });

  it("cada movimiento deja usuario, referencia, evento y los deltas de cada estado", async () => {
    await tx(db => reservarPedido(db, { ...pedido("L"), items: [{ sku: "ABDOMEN", cantidad: 5 }], usuario: "valentina" }));
    const m = await pg.query(`SELECT evento, referencia, usuario, event_id, cantidad, delta_reservado FROM movimientos WHERE event_id IS NOT NULL`);
    assert.deepEqual(m.rows[0], { evento: "reserva", referencia: "L", usuario: "valentina", event_id: "reserva:tiendanube:L:ABDOMEN", cantidad: 0, delta_reservado: 5 });
  });

  it("una operación inválida revierte TODO (transacción atómica)", async () => {
    await assert.rejects(tx(async db => {
      await registrarRecepcion(db, { storeId: S, sku: "ABDOMEN", cantidad: 10, referencia: "X", eventId: "e:x" });
      await aplicar(db, { storeId: S, sku: "ABDOMEN", dReservado: -1, evento: "liberacion", eventId: "e:y" }); // reservado no puede quedar negativo
    }), /negativo/);
    assert.equal((await estado("ABDOMEN")).fisico, 100, "la recepción previa también se revirtió");
    const n = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM movimientos WHERE event_id IS NOT NULL`);
    assert.equal(Number(n.rows[0].n), 0, "no quedó ninguna fila del libro");
  });

  it("no se puede pasar a defectuoso más de lo que hay en revisión", async () => {
    await assert.rejects(tx(db => moverEntreEstados(db, { storeId: S, sku: "ABDOMEN", cantidad: 1, de: "revision", a: "defectuoso", motivo: "x" })), /negativo/);
  });

  it("rechaza cantidades inválidas", async () => {
    await assert.rejects(tx(db => reservarPedido(db, { ...pedido("Z"), items: [{ sku: "ABDOMEN", cantidad: 0 }] })), /entero mayor a 0/);
    await assert.rejects(tx(db => registrarRecepcion(db, { storeId: S, sku: "ABDOMEN", cantidad: 1.5, referencia: "x", eventId: "e" })), /entero mayor a 0/);
  });
});

describe("Reservas y combos", () => {
  beforeEach(preparar); // base nueva y limpia antes de CADA caso
  it("avisa cuando la reserva supera el disponible, pero la registra", async () => {
    const r = await tx(db => reservarPedido(db, { ...pedido("F"), items: [{ sku: "ABDOMEN", cantidad: 150 }] }));
    assert.deepEqual(r.insuficiente, [{ sku: "ABDOMEN", disponible: 100, solicitado: 150 }]);
    assert.equal((await estado("ABDOMEN")).disponible, -50);
  });

  it("despachar sin reserva previa descuenta directo (como hoy)", async () => {
    await tx(db => despacharPedido(db, { ...pedido("D"), items: [{ sku: "ABDOMEN", cantidad: 4 }] }));
    assert.deepEqual(await estado("ABDOMEN"), { sku: "ABDOMEN", fisico: 96, reservado: 0, disponible: 96, defectuoso: 0, enRevision: 0 });
  });

  it("si el combo cambió entre reservar y despachar, no queda stock reservado huérfano", async () => {
    await tx(db => reservarPedido(db, { ...pedido("K"), items: [{ sku: "ABDOMEN-BRAZOS-GLUTEOS", cantidad: 1 }] }));
    await pg.query(`DELETE FROM kits WHERE store_id = $1 AND kit_sku = 'ABDOMEN-BRAZOS-GLUTEOS'`, [S]);
    await kit("ABDOMEN-BRAZOS-GLUTEOS", [["ABDOMEN", 1], ["GLUTEOS", 1]]); // nueva composición
    await tx(db => despacharPedido(db, { ...pedido("K"), items: [{ sku: "ABDOMEN-BRAZOS-GLUTEOS", cantidad: 1 }] }));
    for (const d of await getDisponibilidad(pg as unknown as Queryable, S)) assert.equal(d.reservado, 0, `${d.sku} quedó con reserva huérfana`);
    assert.equal((await estado("ABDOMEN")).fisico, 99);
    assert.equal((await estado("ABDOMEN-BRAZOS")).fisico, 100, "el componente viejo se liberó, no se descontó");
  });

  it("expandirAComponentes suma SKUs repetidos y combos compartiendo componentes", async () => {
    const m = await expandirAComponentes(pg as unknown as Queryable, S, [
      { sku: "ABDOMEN-BRAZOS-GLUTEOS", cantidad: 1 }, { sku: "GLUTEOS-ABDOMEN", cantidad: 1 }, { sku: "GLUTEOS", cantidad: 1 },
    ]);
    assert.deepEqual(Object.fromEntries(m), { "ABDOMEN-BRAZOS": 1, GLUTEOS: 3, ABDOMEN: 1 });
  });
});
