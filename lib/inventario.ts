// Núcleo del inventario (Etapa 1 de docs/auditoria-abastecimiento-etapa-0.md).
//
// Estados de stock por SKU físico (tabla `stock`):
//   cantidad     = stock físico APTO para vender (igual que hoy)
//   reservado    = parte del apto comprometida a pedidos todavía no despachados
//   defectuoso   = unidades que no se pueden vender
//   en_revision  = devoluciones pendientes de control
//   disponible   = cantidad - reservado (se calcula, no se guarda)
//
// Toda variación pasa por aplicar(), que deja una fila en el libro
// `movimientos` con un event_id único: reintentar el mismo evento (webhook,
// doble escaneo, reexportación) no vuelve a mover el stock.
//
// IMPORTANTE: estas funciones hacen varias consultas que tienen que ser
// atómicas. Se las debe llamar con una conexión dentro de una transacción
// (BEGIN/COMMIT) — el driver HTTP `neon()` que usa el resto de la app NO
// sirve para esto. Todavía no están conectadas a Despacho, webhooks ni a la
// pantalla de Stock: ver "Etapa 1" en el documento de auditoría.

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type Evento =
  | "reserva" | "liberacion" | "despacho" | "recepcion"
  | "devolucion" | "reclasificacion";

export type EstadoStock = "apto" | "defectuoso" | "revision";

export interface ItemPedido { sku: string; cantidad: number; nombre?: string }

// ─── Esquema (solo agrega: no rompe nada de lo que ya usa la app) ────────────

export async function migrarInventario(db: Queryable): Promise<void> {
  const ddl = [
    `ALTER TABLE stock ADD COLUMN IF NOT EXISTS reservado   INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE stock ADD COLUMN IF NOT EXISTS defectuoso  INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE stock ADD COLUMN IF NOT EXISTS en_revision INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS event_id        TEXT`,
    `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS evento          TEXT`,
    `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS referencia      TEXT`,
    `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS usuario         TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS delta_reservado INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS delta_defectuoso INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS delta_revision  INTEGER NOT NULL DEFAULT 0`,
    `CREATE UNIQUE INDEX IF NOT EXISTS movimientos_event_uidx
       ON movimientos (store_id, event_id) WHERE event_id IS NOT NULL`,
    // Una reserva por (pedido, SKU físico): es lo que hace idempotente reservar.
    `CREATE TABLE IF NOT EXISTS reservas (
       id           SERIAL PRIMARY KEY,
       store_id     TEXT NOT NULL,
       canal        TEXT NOT NULL,
       numero_orden TEXT NOT NULL,
       sku          TEXT NOT NULL,
       cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
       estado       TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','consumida','liberada')),
       created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       UNIQUE (store_id, canal, numero_orden, sku)
     )`,
  ];
  for (const sentencia of ddl) await db.query(sentencia);
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function exigirEnteroPositivo(n: number, que: string): void {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${que} tiene que ser un entero mayor a 0 (recibido: ${n})`);
}

// Un SKU comercial que es combo (tabla `kits`) se reemplaza por sus
// componentes físicos; nunca se cuenta como una unidad física propia.
export async function expandirAComponentes(
  db: Queryable, storeId: string, items: ItemPedido[],
): Promise<Map<string, number>> {
  for (const it of items) exigirEnteroPositivo(it.cantidad, `La cantidad de ${it.sku}`);
  const kits = await db.query(
    `SELECT kit_sku, component_sku, cantidad FROM kits WHERE store_id = $1 AND kit_sku = ANY($2)`,
    [storeId, items.map(i => i.sku)],
  );
  const porKit = new Map<string, { sku: string; cantidad: number }[]>();
  for (const k of kits.rows) {
    const lista = porKit.get(k.kit_sku as string) ?? [];
    lista.push({ sku: k.component_sku as string, cantidad: Number(k.cantidad) });
    porKit.set(k.kit_sku as string, lista);
  }
  const fisicos = new Map<string, number>();
  for (const it of items) {
    const componentes = porKit.get(it.sku);
    if (componentes?.length) {
      for (const c of componentes) fisicos.set(c.sku, (fisicos.get(c.sku) ?? 0) + c.cantidad * it.cantidad);
    } else {
      fisicos.set(it.sku, (fisicos.get(it.sku) ?? 0) + it.cantidad);
    }
  }
  return fisicos;
}

// ─── Movimiento base ─────────────────────────────────────────────────────────

export interface CambioStock {
  storeId: string;
  sku: string;
  nombre?: string;
  dApto?: number;
  dReservado?: number;
  dDefectuoso?: number;
  dRevision?: number;
  evento: Evento;
  // Compatible con lo que ya lee la app: "venta" solo para egresos por venta
  // de clientes (alimenta las ventas semanales); el resto es "ajuste".
  tipo?: "venta" | "ajuste";
  canal?: string;
  motivo?: string;
  referencia?: string;
  eventId?: string;
  usuario?: string;
}

// Devuelve { aplicado: false } si ese eventId ya se había aplicado. Lanza si
// el movimiento dejaría reservado/defectuoso/en_revisión en negativo (el
// apto sí puede quedar negativo, igual que hoy: se avisa, no se bloquea).
export async function aplicar(db: Queryable, c: CambioStock): Promise<{ aplicado: boolean }> {
  const dApto = c.dApto ?? 0, dRes = c.dReservado ?? 0, dDef = c.dDefectuoso ?? 0, dRev = c.dRevision ?? 0;

  const ledger = await db.query(
    `INSERT INTO movimientos
       (store_id, sku, cantidad, motivo, canal, tipo, event_id, evento, referencia, usuario,
        delta_reservado, delta_defectuoso, delta_revision, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (store_id, event_id) WHERE event_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [c.storeId, c.sku, dApto, c.motivo ?? "", c.canal ?? "tiendanube", c.tipo ?? "ajuste",
     c.eventId ?? null, c.evento, c.referencia ?? null, c.usuario ?? "", dRes, dDef, dRev],
  );
  if (!ledger.rows.length) return { aplicado: false };

  await db.query(
    `INSERT INTO stock (store_id, sku, nombre, cantidad) VALUES ($1,$2,$3,0)
     ON CONFLICT (store_id, sku) DO NOTHING`,
    [c.storeId, c.sku, c.nombre ?? c.sku],
  );
  const upd = await db.query(
    `UPDATE stock
        SET cantidad = cantidad + $3, reservado = reservado + $4,
            defectuoso = defectuoso + $5, en_revision = en_revision + $6, updated_at = NOW()
      WHERE store_id = $1 AND sku = $2
        AND reservado + $4 >= 0 AND defectuoso + $5 >= 0 AND en_revision + $6 >= 0
      RETURNING sku`,
    [c.storeId, c.sku, dApto, dRes, dDef, dRev],
  );
  if (!upd.rows.length) {
    throw new Error(`Movimiento inválido para ${c.sku}: dejaría reservado, defectuoso o en revisión en negativo`);
  }
  return { aplicado: true };
}

// ─── Reservas ────────────────────────────────────────────────────────────────

export interface PedidoRef { storeId: string; canal: string; numeroOrden: string; usuario?: string }

export interface ResultadoReserva {
  reservados: string[];
  omitidos: string[];
  insuficiente: { sku: string; disponible: number; solicitado: number }[];
}

// Reserva (por componentes físicos) lo que pide el pedido. Reservar dos veces
// el mismo pedido no suma: la segunda llamada devuelve todo en `omitidos`.
export async function reservarPedido(
  db: Queryable, p: PedidoRef & { items: ItemPedido[] },
): Promise<ResultadoReserva> {
  const componentes = await expandirAComponentes(db, p.storeId, p.items);
  const res: ResultadoReserva = { reservados: [], omitidos: [], insuficiente: [] };

  for (const [sku, cantidad] of componentes) {
    const nueva = await db.query(
      `INSERT INTO reservas (store_id, canal, numero_orden, sku, cantidad) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (store_id, canal, numero_orden, sku) DO NOTHING RETURNING id`,
      [p.storeId, p.canal, p.numeroOrden, sku, cantidad],
    );
    if (!nueva.rows.length) { res.omitidos.push(sku); continue; }

    const fila = await db.query(`SELECT cantidad - reservado AS disp FROM stock WHERE store_id = $1 AND sku = $2`, [p.storeId, sku]);
    const disponible = fila.rows[0] ? Number(fila.rows[0].disp) : 0;
    if (disponible < cantidad) res.insuficiente.push({ sku, disponible, solicitado: cantidad });

    await aplicar(db, {
      storeId: p.storeId, sku, dReservado: cantidad, evento: "reserva", canal: p.canal,
      referencia: p.numeroOrden, motivo: `Reserva pedido #${p.numeroOrden}`, usuario: p.usuario,
      eventId: `reserva:${p.canal}:${p.numeroOrden}:${sku}`,
    });
    res.reservados.push(sku);
  }
  return res;
}

// Cancelación antes del despacho: devuelve al disponible lo que estaba reservado.
export async function liberarReserva(db: Queryable, p: PedidoRef): Promise<string[]> {
  const activas = await db.query(
    `UPDATE reservas SET estado = 'liberada', updated_at = NOW()
      WHERE store_id = $1 AND canal = $2 AND numero_orden = $3 AND estado = 'activa'
      RETURNING sku, cantidad`,
    [p.storeId, p.canal, p.numeroOrden],
  );
  for (const r of activas.rows) {
    await aplicar(db, {
      storeId: p.storeId, sku: r.sku as string, dReservado: -Number(r.cantidad), evento: "liberacion",
      canal: p.canal, referencia: p.numeroOrden, motivo: `Libera reserva pedido #${p.numeroOrden}`,
      usuario: p.usuario, eventId: `liberacion:${p.canal}:${p.numeroOrden}:${r.sku}`,
    });
  }
  return activas.rows.map(r => r.sku as string);
}

// Salida física del paquete: la reserva (si había) se convierte en egreso
// sin descontar dos veces. Sin reserva previa descuenta directo, como hoy.
// Si después de despachar queda alguna reserva activa de ese pedido (ej. se
// cambió la composición de un combo entre reservar y despachar), se libera.
export async function despacharPedido(
  db: Queryable, p: PedidoRef & { items: ItemPedido[]; esVenta?: boolean; motivo?: string },
): Promise<{ despachados: string[]; omitidos: string[] }> {
  const componentes = await expandirAComponentes(db, p.storeId, p.items);
  // Nombre para crear la fila de stock de un SKU que todavía no existe (igual
  // que hoy: sale del producto del pedido; los componentes de un combo usan su SKU).
  const nombres = new Map(p.items.filter(i => i.nombre).map(i => [i.sku, i.nombre as string]));
  const out = { despachados: [] as string[], omitidos: [] as string[] };

  for (const [sku, cantidad] of componentes) {
    const eventId = `despacho:${p.canal}:${p.numeroOrden}:${sku}`;
    const previo = await db.query(`SELECT 1 FROM movimientos WHERE store_id = $1 AND event_id = $2`, [p.storeId, eventId]);
    if (previo.rows.length) { out.omitidos.push(sku); continue; }

    const consumida = await db.query(
      `UPDATE reservas SET estado = 'consumida', updated_at = NOW()
        WHERE store_id = $1 AND canal = $2 AND numero_orden = $3 AND sku = $4 AND estado = 'activa'
        RETURNING cantidad`,
      [p.storeId, p.canal, p.numeroOrden, sku],
    );
    const reservada = consumida.rows[0] ? Number(consumida.rows[0].cantidad) : 0;

    const { aplicado } = await aplicar(db, {
      storeId: p.storeId, sku, nombre: nombres.get(sku), dApto: -cantidad, dReservado: -reservada, evento: "despacho",
      tipo: p.esVenta === false ? "ajuste" : "venta", canal: p.canal, referencia: p.numeroOrden,
      motivo: p.motivo ?? `Despacho pedido #${p.numeroOrden}`, usuario: p.usuario, eventId,
    });
    if (!aplicado) {
      // Otro despacho del mismo pedido ganó la carrera y ya lo registró. Si
      // este había tomado una reserva, algo quedó inconsistente: se revierte.
      if (reservada > 0) throw new Error(`Despacho de ${sku} (pedido #${p.numeroOrden}) en estado inconsistente: revertido`);
      out.omitidos.push(sku);
      continue;
    }
    out.despachados.push(sku);
  }
  await liberarReserva(db, p);
  return out;
}

// ─── Recepciones, devoluciones y estados ─────────────────────────────────────

export async function registrarRecepcion(db: Queryable, p: {
  storeId: string; sku: string; nombre?: string; cantidad: number;
  referencia: string; eventId: string; usuario?: string;
}): Promise<{ aplicado: boolean }> {
  exigirEnteroPositivo(p.cantidad, "La cantidad recibida");
  return aplicar(db, {
    storeId: p.storeId, sku: p.sku, nombre: p.nombre, dApto: p.cantidad, evento: "recepcion",
    referencia: p.referencia, motivo: `Recepción ${p.referencia}`, usuario: p.usuario, eventId: p.eventId,
  });
}

// Una devolución entra a "en revisión": nunca vuelve sola a stock vendible.
export async function ingresarDevolucion(db: Queryable, p: {
  storeId: string; sku: string; cantidad: number; referencia: string; eventId: string; usuario?: string;
}): Promise<{ aplicado: boolean }> {
  exigirEnteroPositivo(p.cantidad, "La cantidad devuelta");
  return aplicar(db, {
    storeId: p.storeId, sku: p.sku, dRevision: p.cantidad, evento: "devolucion",
    referencia: p.referencia, motivo: `Devolución ${p.referencia}`, usuario: p.usuario, eventId: p.eventId,
  });
}

const CAMPO_ESTADO: Record<EstadoStock, "dApto" | "dDefectuoso" | "dRevision"> = {
  apto: "dApto", defectuoso: "dDefectuoso", revision: "dRevision",
};

// Pasa unidades de un estado a otro (ej. revisión → apto, apto → defectuoso).
export async function moverEntreEstados(db: Queryable, p: {
  storeId: string; sku: string; cantidad: number; de: EstadoStock; a: EstadoStock;
  motivo: string; eventId?: string; usuario?: string;
}): Promise<{ aplicado: boolean }> {
  exigirEnteroPositivo(p.cantidad, "La cantidad a mover");
  if (p.de === p.a) throw new Error("El estado de origen y el de destino son el mismo");
  return aplicar(db, {
    storeId: p.storeId, sku: p.sku, evento: "reclasificacion", motivo: p.motivo,
    usuario: p.usuario, eventId: p.eventId,
    [CAMPO_ESTADO[p.de]]: -p.cantidad, [CAMPO_ESTADO[p.a]]: p.cantidad,
  });
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export interface DisponibilidadSku {
  sku: string; fisico: number; reservado: number; disponible: number; defectuoso: number; enRevision: number;
}

export async function getDisponibilidad(db: Queryable, storeId: string): Promise<DisponibilidadSku[]> {
  const r = await db.query(
    `SELECT sku, cantidad, reservado, defectuoso, en_revision FROM stock WHERE store_id = $1 ORDER BY sku`,
    [storeId],
  );
  return r.rows.map(x => ({
    sku: x.sku as string, fisico: Number(x.cantidad), reservado: Number(x.reservado),
    disponible: Number(x.cantidad) - Number(x.reservado),
    defectuoso: Number(x.defectuoso), enRevision: Number(x.en_revision),
  }));
}
