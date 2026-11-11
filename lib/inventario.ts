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
  | "devolucion" | "reclasificacion" | "recuento";

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
    // Recuentos físicos: el ajuste solo se aplica cuando un supervisor lo aprueba.
    `CREATE TABLE IF NOT EXISTS recuentos (
       id               SERIAL PRIMARY KEY,
       store_id         TEXT NOT NULL,
       sku              TEXT NOT NULL,
       cantidad_teorica INTEGER NOT NULL,
       cantidad_contada INTEGER NOT NULL CHECK (cantidad_contada >= 0),
       diferencia       INTEGER NOT NULL,
       motivo           TEXT NOT NULL DEFAULT '',
       estado           TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')),
       contado_por      TEXT NOT NULL DEFAULT '',
       resuelto_por     TEXT,
       resuelto_at      TIMESTAMPTZ,
       created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS recuentos_store_estado ON recuentos (store_id, estado, created_at DESC)`,
    // Registro de auditoría general: quién cambió qué, con valor anterior y nuevo.
    `CREATE TABLE IF NOT EXISTS auditoria (
       id          SERIAL PRIMARY KEY,
       store_id    TEXT NOT NULL,
       entidad     TEXT NOT NULL,
       entidad_id  TEXT NOT NULL,
       accion      TEXT NOT NULL,
       usuario     TEXT NOT NULL DEFAULT '',
       antes       JSONB,
       despues     JSONB,
       motivo      TEXT NOT NULL DEFAULT '',
       created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS auditoria_store_entidad ON auditoria (store_id, entidad, entidad_id, created_at DESC)`,
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

// ─── Auditoría ───────────────────────────────────────────────────────────────

export interface EntradaAuditoria {
  storeId: string; entidad: string; entidadId: string; accion: string;
  usuario?: string; antes?: unknown; despues?: unknown; motivo?: string;
}

export async function registrarAuditoria(db: Queryable, a: EntradaAuditoria): Promise<void> {
  await db.query(
    `INSERT INTO auditoria (store_id, entidad, entidad_id, accion, usuario, antes, despues, motivo)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
    [a.storeId, a.entidad, a.entidadId, a.accion, a.usuario ?? "",
     a.antes === undefined ? null : JSON.stringify(a.antes),
     a.despues === undefined ? null : JSON.stringify(a.despues), a.motivo ?? ""],
  );
}

async function fotoStock(db: Queryable, storeId: string, sku: string) {
  const r = await db.query(
    `SELECT cantidad, reservado, defectuoso, en_revision FROM stock WHERE store_id = $1 AND sku = $2`, [storeId, sku]);
  const x = r.rows[0];
  return x ? { apto: Number(x.cantidad), reservado: Number(x.reservado), defectuoso: Number(x.defectuoso), enRevision: Number(x.en_revision) } : null;
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
  const antes = await fotoStock(db, p.storeId, p.sku);
  const r = await aplicar(db, {
    storeId: p.storeId, sku: p.sku, dRevision: p.cantidad, evento: "devolucion",
    referencia: p.referencia, motivo: `Devolución ${p.referencia}`, usuario: p.usuario, eventId: p.eventId,
  });
  if (r.aplicado) {
    await registrarAuditoria(db, {
      storeId: p.storeId, entidad: "stock", entidadId: p.sku, accion: "devolucion", usuario: p.usuario,
      antes, despues: await fotoStock(db, p.storeId, p.sku), motivo: p.referencia,
    });
  }
  return r;
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
  const antes = await fotoStock(db, p.storeId, p.sku);
  const r = await aplicar(db, {
    storeId: p.storeId, sku: p.sku, evento: "reclasificacion", motivo: p.motivo,
    usuario: p.usuario, eventId: p.eventId,
    [CAMPO_ESTADO[p.de]]: -p.cantidad, [CAMPO_ESTADO[p.a]]: p.cantidad,
  });
  if (r.aplicado) {
    await registrarAuditoria(db, {
      storeId: p.storeId, entidad: "stock", entidadId: p.sku, accion: `${p.de}->${p.a}`, usuario: p.usuario,
      antes, despues: await fotoStock(db, p.storeId, p.sku), motivo: p.motivo,
    });
  }
  return r;
}

// ─── Recuentos físicos ───────────────────────────────────────────────────────

export interface Recuento {
  id: number; sku: string; cantidadTeorica: number; cantidadContada: number; diferencia: number;
  motivo: string; estado: "pendiente" | "aprobado" | "rechazado"; contadoPor: string;
  resueltoPor: string | null; resueltoAt: string | null; createdAt: string;
}

function aRecuento(r: Record<string, unknown>): Recuento {
  return {
    id: Number(r.id), sku: r.sku as string, cantidadTeorica: Number(r.cantidad_teorica),
    cantidadContada: Number(r.cantidad_contada), diferencia: Number(r.diferencia), motivo: r.motivo as string,
    estado: r.estado as Recuento["estado"], contadoPor: r.contado_por as string,
    resueltoPor: (r.resuelto_por as string | null) ?? null,
    resueltoAt: r.resuelto_at ? new Date(r.resuelto_at as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

// Registra lo que se contó contra lo que el sistema decía. Si coincide, queda
// resuelto solo; si no, queda PENDIENTE y NO toca el stock hasta que un
// supervisor lo apruebe. La diferencia se mide contra el stock del momento del
// conteo, así las ventas que ocurran hasta la aprobación no distorsionan el ajuste.
export async function crearRecuento(db: Queryable, p: {
  storeId: string; sku: string; cantidadContada: number; motivo?: string; usuario?: string;
}): Promise<Recuento> {
  if (!Number.isInteger(p.cantidadContada) || p.cantidadContada < 0) {
    throw new Error("La cantidad contada tiene que ser un entero mayor o igual a 0");
  }
  const actual = await fotoStock(db, p.storeId, p.sku);
  if (!actual) throw new Error(`El SKU ${p.sku} no existe en el stock`);
  const diferencia = p.cantidadContada - actual.apto;
  const estado = diferencia === 0 ? "aprobado" : "pendiente";

  const r = await db.query(
    `INSERT INTO recuentos (store_id, sku, cantidad_teorica, cantidad_contada, diferencia, motivo, estado, contado_por, resuelto_por, resuelto_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [p.storeId, p.sku, actual.apto, p.cantidadContada, diferencia, p.motivo ?? "", estado, p.usuario ?? "",
     diferencia === 0 ? "(coincide)" : null, diferencia === 0 ? new Date().toISOString() : null],
  );
  const rec = aRecuento(r.rows[0]);
  await registrarAuditoria(db, {
    storeId: p.storeId, entidad: "recuento", entidadId: String(rec.id), accion: "creado", usuario: p.usuario,
    despues: rec, motivo: p.motivo,
  });
  return rec;
}

// Aprobar aplica el ajuste (un movimiento auditable con event_id: aprobar dos
// veces, incluso a la vez, ajusta una sola). Rechazar no toca el stock.
export async function resolverRecuento(db: Queryable, p: {
  storeId: string; id: number; resolucion: "aprobar" | "rechazar"; usuario: string; motivo?: string;
}): Promise<Recuento> {
  const upd = await db.query(
    `UPDATE recuentos SET estado = $3, resuelto_por = $4, resuelto_at = NOW()
      WHERE store_id = $1 AND id = $2 AND estado = 'pendiente' RETURNING *`,
    [p.storeId, p.id, p.resolucion === "aprobar" ? "aprobado" : "rechazado", p.usuario],
  );
  if (!upd.rows.length) throw new Error("El recuento no existe o ya estaba resuelto");
  const rec = aRecuento(upd.rows[0]);

  if (p.resolucion === "aprobar") {
    await aplicar(db, {
      storeId: p.storeId, sku: rec.sku, dApto: rec.diferencia, evento: "recuento", referencia: `recuento:${rec.id}`,
      motivo: `Recuento #${rec.id}${rec.motivo ? `: ${rec.motivo}` : ""}`, usuario: p.usuario, eventId: `recuento:${rec.id}`,
    });
  }
  await registrarAuditoria(db, {
    storeId: p.storeId, entidad: "recuento", entidadId: String(rec.id), accion: p.resolucion === "aprobar" ? "aprobado" : "rechazado",
    usuario: p.usuario, antes: { estado: "pendiente", diferencia: rec.diferencia }, despues: rec, motivo: p.motivo,
  });
  return rec;
}

export async function listarRecuentos(db: Queryable, storeId: string, estado?: Recuento["estado"]): Promise<Recuento[]> {
  const r = await db.query(
    `SELECT * FROM recuentos WHERE store_id = $1 AND ($2::text IS NULL OR estado = $2) ORDER BY created_at DESC LIMIT 100`,
    [storeId, estado ?? null],
  );
  return r.rows.map(aRecuento);
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

export interface FilaInventario extends DisponibilidadSku { nombre: string }

// Igual que getDisponibilidad pero con el nombre del producto, para mostrar en pantalla.
export async function getInventario(db: Queryable, storeId: string): Promise<FilaInventario[]> {
  const r = await db.query(
    `SELECT sku, nombre, cantidad, reservado, defectuoso, en_revision FROM stock WHERE store_id = $1 ORDER BY sku`,
    [storeId],
  );
  return r.rows.map(x => ({
    sku: x.sku as string, nombre: (x.nombre as string) ?? "", fisico: Number(x.cantidad), reservado: Number(x.reservado),
    disponible: Number(x.cantidad) - Number(x.reservado), defectuoso: Number(x.defectuoso), enRevision: Number(x.en_revision),
  }));
}
