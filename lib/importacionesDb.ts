import { getDb } from "./db";
import { ajustarStock } from "./stockDb";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CompraImportacion {
  id: number;
  store_id: string;
  fecha_compra: string;
  // Nullable: algunas compras (sobre todo las más chicas/recientes) no
  // tienen todavía un tracking de courier internacional asignado —
  // confirmado en el Excel real, no es un caso hipotético. Una compra sin
  // tracking simplemente no se puede escanear en /importaciones/recepcion;
  // queda solo como registro (y hay que marcarla recibida a mano si hiciera
  // falta, no hay UI para eso todavía).
  tracking_number: string | null;
  fecha_llegada_estimada: string | null;
  fecha_llegada_real: string | null;
  dap: number | null;
  pague: number | null;
  precio_usd: number | null;
  declaro: number | null;
  impuestos: number | null;
  total_ars: number | null;
  nota: string;
  created_by: string;
  created_at: string;
}

export interface LineaCompraImportacion {
  id: number;
  compra_id: number;
  sku: string;
  nombre: string;
  cantidad_esperada: number;
  cantidad_recibida: number;
  unidades_por_caja: number | null;
  // Estado por línea (como el color de cada fila del Excel): "impuestos
  // pagados" se marca a mano; "llegó" no se guarda, se deduce de
  // cantidad_recibida >= cantidad_esperada (o sea, del escaneo en Recepción).
  impuestos_pagados: boolean;
  created_at: string;
}

export interface CompraConLineas extends CompraImportacion {
  lineas: LineaCompraImportacion[];
}

export interface RecepcionEscaneo {
  id: number;
  compra_id: number;
  linea_id: number;
  tracking_number: string;
  sku: string;
  cantidad: number;
  scanned_by: string;
  created_at: string;
}

export interface NuevaLineaInput {
  sku: string;
  nombre?: string;
  cantidadEsperada: number;
  unidadesPorCaja?: number | null;
}

export interface NuevaCompraInput {
  storeId: string;
  fechaCompra: string;
  trackingNumber: string | null;
  fechaLlegadaEstimada?: string | null;
  dap?: number | null;
  pague?: number | null;
  precioUsd?: number | null;
  declaro?: number | null;
  impuestos?: number | null;
  totalArs?: number | null;
  nota?: string;
  createdBy: string;
  lineas: NuevaLineaInput[];
  // Solo para el import histórico: la compra ya llegó completa y no debe
  // afectar stock (esas unidades ya están reflejadas en stock.cantidad hoy).
  yaRecibidoCompleto?: boolean;
  fechaLlegadaReal?: string | null;
}

// ─── Init ────────────────────────────────────────────────────────────────────

let importacionesInicializado = false;

export async function initImportacionesTables(): Promise<void> {
  if (importacionesInicializado) return;
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS compras_importacion (
      id                      SERIAL PRIMARY KEY,
      store_id                TEXT NOT NULL,
      fecha_compra            DATE NOT NULL,
      tracking_number         TEXT, -- nullable: no todas las compras tienen courier internacional asignado (ver comentario en CompraImportacion)
      fecha_llegada_estimada  DATE,
      fecha_llegada_real      DATE,
      dap                     NUMERIC(14,2),
      pague                   NUMERIC(14,2),
      precio_usd              NUMERIC(14,2),
      declaro                 NUMERIC(14,2),
      impuestos               NUMERIC(14,2),
      total_ars               NUMERIC(14,2),
      nota                    TEXT NOT NULL DEFAULT '',
      created_by              TEXT NOT NULL DEFAULT '',
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Varias compras pueden viajar en un mismo envío consolidado (mismo
  // tracking, como la celda combinada del Excel) — por eso el índice ya NO es
  // único. Antes lo era, y eso dejaba los envíos consolidados partidos.
  await sql`DROP INDEX IF EXISTS compras_importacion_tracking_uidx`;
  await sql`
    CREATE INDEX IF NOT EXISTS compras_importacion_tracking_idx
    ON compras_importacion (tracking_number)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS compras_importacion_store_fecha_idx
    ON compras_importacion (store_id, fecha_compra DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS compras_importacion_lineas (
      id                  SERIAL PRIMARY KEY,
      compra_id           INTEGER NOT NULL REFERENCES compras_importacion(id) ON DELETE CASCADE,
      sku                 TEXT NOT NULL,
      nombre              TEXT NOT NULL DEFAULT '',
      cantidad_esperada   INTEGER NOT NULL,
      cantidad_recibida   INTEGER NOT NULL DEFAULT 0,
      unidades_por_caja   INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS compras_importacion_lineas_compra_idx
    ON compras_importacion_lineas (compra_id)
  `;
  await sql`
    ALTER TABLE compras_importacion_lineas
    ADD COLUMN IF NOT EXISTS impuestos_pagados BOOLEAN NOT NULL DEFAULT false
  `;

  // Log de cada caja física confirmada. A propósito SIN índice único en
  // tracking_number: reescanear el mismo tracking es el flujo esperado (una
  // vez por caja física de un mismo envío), a diferencia de Despacho donde
  // un mismo tracking solo puede despacharse una vez.
  await sql`
    CREATE TABLE IF NOT EXISTS recepcion_escaneos (
      id               SERIAL PRIMARY KEY,
      compra_id        INTEGER NOT NULL REFERENCES compras_importacion(id) ON DELETE CASCADE,
      linea_id         INTEGER NOT NULL REFERENCES compras_importacion_lineas(id) ON DELETE CASCADE,
      tracking_number  TEXT NOT NULL,
      sku              TEXT NOT NULL,
      cantidad         INTEGER NOT NULL,
      scanned_by       TEXT NOT NULL DEFAULT '',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS recepcion_escaneos_compra_idx ON recepcion_escaneos (compra_id)`;
  await sql`CREATE INDEX IF NOT EXISTS recepcion_escaneos_tracking_idx ON recepcion_escaneos (tracking_number)`;
  await sql`CREATE INDEX IF NOT EXISTS recepcion_escaneos_created_idx ON recepcion_escaneos (created_at DESC)`;

  importacionesInicializado = true;
}

// ─── Helpers internos ──────────────────────────────────────────────────────

async function getLineasDeCompra(compraId: number): Promise<LineaCompraImportacion[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM compras_importacion_lineas WHERE compra_id = ${compraId} ORDER BY id
  `;
  return rows as LineaCompraImportacion[];
}

function armarCompraConLineas(compra: CompraImportacion, lineas: LineaCompraImportacion[]): CompraConLineas {
  return { ...compra, lineas };
}

// ─── CRUD compras ────────────────────────────────────────────────────────────

export async function crearCompra(input: NuevaCompraInput): Promise<CompraConLineas> {
  const sql = getDb();
  const fechaLlegadaReal = input.yaRecibidoCompleto ? (input.fechaLlegadaReal ?? input.fechaLlegadaEstimada ?? null) : null;

  const rows = await sql`
    INSERT INTO compras_importacion (
      store_id, fecha_compra, tracking_number, fecha_llegada_estimada, fecha_llegada_real,
      dap, pague, precio_usd, declaro, impuestos, total_ars, nota, created_by
    ) VALUES (
      ${input.storeId}, ${input.fechaCompra}::date, ${input.trackingNumber},
      ${input.fechaLlegadaEstimada ?? null}::date, ${fechaLlegadaReal}::date,
      ${input.dap ?? null}, ${input.pague ?? null}, ${input.precioUsd ?? null},
      ${input.declaro ?? null}, ${input.impuestos ?? null}, ${input.totalArs ?? null},
      ${input.nota ?? ""}, ${input.createdBy}
    )
    RETURNING *
  ` as CompraImportacion[];
  const compra = rows[0];

  // Desde la grilla, "agregar compra" crea una fila en blanco para completar
  // celda por celda, igual que agregar una fila en el Excel.
  const lineasACrear: NuevaLineaInput[] = input.lineas.length > 0
    ? input.lineas
    : [{ sku: "", nombre: "", cantidadEsperada: 0 }];

  const lineas: LineaCompraImportacion[] = [];
  for (const linea of lineasACrear) {
    const cantidadRecibida = input.yaRecibidoCompleto ? linea.cantidadEsperada : 0;
    const lineaRows = await sql`
      INSERT INTO compras_importacion_lineas (compra_id, sku, nombre, cantidad_esperada, cantidad_recibida, unidades_por_caja)
      VALUES (${compra.id}, ${linea.sku}, ${linea.nombre ?? linea.sku}, ${linea.cantidadEsperada}, ${cantidadRecibida}, ${linea.unidadesPorCaja ?? null})
      RETURNING *
    ` as LineaCompraImportacion[];
    lineas.push(lineaRows[0]);
  }

  return armarCompraConLineas(compra, lineas);
}

export interface FiltrosCompras {
  q?: string;
  desde?: string;
  hasta?: string;
  soloPendientes?: boolean;
  limit?: number;
}

export async function listarCompras(storeId: string, filtros: FiltrosCompras = {}): Promise<CompraConLineas[]> {
  const sql = getDb();
  const limit = filtros.limit ?? 200;
  const compras = await sql`
    SELECT * FROM compras_importacion
    WHERE store_id = ${storeId}
      AND (${filtros.q ?? null}::text IS NULL OR tracking_number ILIKE '%' || ${filtros.q ?? null} || '%')
      AND (${filtros.desde ?? null}::date IS NULL OR fecha_compra >= ${filtros.desde ?? null}::date)
      AND (${filtros.hasta ?? null}::date IS NULL OR fecha_compra <= ${filtros.hasta ?? null}::date)
    ORDER BY fecha_compra DESC, id DESC
    LIMIT ${limit}
  ` as CompraImportacion[];

  if (compras.length === 0) return [];

  const ids = compras.map(c => c.id);
  const todasLasLineas = await sql`
    SELECT * FROM compras_importacion_lineas WHERE compra_id = ANY(${ids}) ORDER BY id
  ` as LineaCompraImportacion[];

  const lineasPorCompra = new Map<number, LineaCompraImportacion[]>();
  for (const l of todasLasLineas) {
    if (!lineasPorCompra.has(l.compra_id)) lineasPorCompra.set(l.compra_id, []);
    lineasPorCompra.get(l.compra_id)!.push(l);
  }

  const resultado = compras.map(c => armarCompraConLineas(c, lineasPorCompra.get(c.id) ?? []));

  if (!filtros.soloPendientes) return resultado;
  return resultado.filter(c => c.lineas.some(l => l.cantidad_recibida < l.cantidad_esperada));
}

export async function getCompraById(id: number): Promise<CompraConLineas | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM compras_importacion WHERE id = ${id}` as CompraImportacion[];
  if (!rows[0]) return null;
  const lineas = await getLineasDeCompra(id);
  return armarCompraConLineas(rows[0], lineas);
}

export type EdicionCompraInput = Partial<Pick<NuevaCompraInput,
  "fechaCompra" | "trackingNumber" | "fechaLlegadaEstimada" | "dap" | "pague" | "precioUsd" | "declaro" | "impuestos" | "totalArs" | "nota"
>> & { lineas?: NuevaLineaInput[] };

// Reemplaza cabecera + (opcionalmente) líneas. No permite bajar cantidad_esperada
// por debajo de lo ya recibido, ni borrar una línea con recepción > 0 — eso
// rompería la trazabilidad de algo que ya impactó stock real.
export async function editarCompra(id: number, input: EdicionCompraInput): Promise<CompraConLineas> {
  const sql = getDb();
  const actual = await getCompraById(id);
  if (!actual) throw new Error("Compra no encontrada");

  // Solo se tocan los campos que vinieron en el input (CASE WHEN por campo),
  // nunca se reescribe el resto con lo leído antes: la grilla guarda celda
  // por celda, y dos guardados casi simultáneos de la misma compra (ej. DAP
  // + Tab + PAGUÉ) se pisarían entre sí si cada uno reescribiera todo.
  const viene = (k: keyof EdicionCompraInput) => input[k] !== undefined;
  await sql`
    UPDATE compras_importacion SET
      fecha_compra = CASE WHEN ${viene("fechaCompra")} THEN ${input.fechaCompra ?? null}::date ELSE fecha_compra END,
      tracking_number = CASE WHEN ${viene("trackingNumber")} THEN ${input.trackingNumber ?? null} ELSE tracking_number END,
      fecha_llegada_estimada = CASE WHEN ${viene("fechaLlegadaEstimada")} THEN ${input.fechaLlegadaEstimada ?? null}::date ELSE fecha_llegada_estimada END,
      dap = CASE WHEN ${viene("dap")} THEN ${input.dap ?? null}::numeric ELSE dap END,
      pague = CASE WHEN ${viene("pague")} THEN ${input.pague ?? null}::numeric ELSE pague END,
      precio_usd = CASE WHEN ${viene("precioUsd")} THEN ${input.precioUsd ?? null}::numeric ELSE precio_usd END,
      declaro = CASE WHEN ${viene("declaro")} THEN ${input.declaro ?? null}::numeric ELSE declaro END,
      impuestos = CASE WHEN ${viene("impuestos")} THEN ${input.impuestos ?? null}::numeric ELSE impuestos END,
      total_ars = CASE WHEN ${viene("totalArs")} THEN ${input.totalArs ?? null}::numeric ELSE total_ars END,
      nota = CASE WHEN ${viene("nota")} THEN ${input.nota ?? ""} ELSE nota END
    WHERE id = ${id}
  `;

  if (input.lineas) {
    const idsConservados = new Set<number>();
    for (const linea of input.lineas) {
      const existente = actual.lineas.find(l => l.sku === linea.sku);
      if (existente) {
        if (linea.cantidadEsperada < existente.cantidad_recibida) {
          throw new Error(`No se puede bajar lo esperado de ${linea.sku} por debajo de lo ya recibido (${existente.cantidad_recibida})`);
        }
        await sql`
          UPDATE compras_importacion_lineas
          SET cantidad_esperada = ${linea.cantidadEsperada}, nombre = ${linea.nombre ?? existente.nombre},
              unidades_por_caja = ${linea.unidadesPorCaja ?? null}
          WHERE id = ${existente.id}
        `;
        idsConservados.add(existente.id);
      } else {
        const nueva = await sql`
          INSERT INTO compras_importacion_lineas (compra_id, sku, nombre, cantidad_esperada, cantidad_recibida, unidades_por_caja)
          VALUES (${id}, ${linea.sku}, ${linea.nombre ?? linea.sku}, ${linea.cantidadEsperada}, 0, ${linea.unidadesPorCaja ?? null})
          RETURNING id
        ` as { id: number }[];
        idsConservados.add(nueva[0].id);
      }
    }
    for (const vieja of actual.lineas) {
      if (idsConservados.has(vieja.id)) continue;
      if (vieja.cantidad_recibida > 0) {
        throw new Error(`No se puede quitar la línea ${vieja.sku}: ya tiene ${vieja.cantidad_recibida} unidades recibidas`);
      }
      await sql`DELETE FROM compras_importacion_lineas WHERE id = ${vieja.id}`;
    }
  }

  return (await getCompraById(id))!;
}

export async function borrarCompra(id: number): Promise<void> {
  const compra = await getCompraById(id);
  if (!compra) return;
  if (compra.lineas.some(l => l.cantidad_recibida > 0)) {
    throw new Error("No se puede borrar: esta compra ya tiene cajas recibidas registradas");
  }
  const sql = getDb();
  await sql`DELETE FROM compras_importacion WHERE id = ${id}`;
}

// ─── CRUD líneas (edición celda por celda desde la grilla) ──────────────────

async function getLineaById(id: number): Promise<LineaCompraImportacion | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM compras_importacion_lineas WHERE id = ${id}` as LineaCompraImportacion[];
  return rows[0] ?? null;
}

export async function agregarLinea(compraId: number, input: Partial<NuevaLineaInput> = {}): Promise<LineaCompraImportacion> {
  const sql = getDb();
  const compra = await sql`SELECT id FROM compras_importacion WHERE id = ${compraId}` as { id: number }[];
  if (!compra[0]) throw new Error("Compra no encontrada");
  const rows = await sql`
    INSERT INTO compras_importacion_lineas (compra_id, sku, nombre, cantidad_esperada, cantidad_recibida)
    VALUES (${compraId}, ${input.sku ?? ""}, ${input.nombre ?? input.sku ?? ""}, ${input.cantidadEsperada ?? 0}, 0)
    RETURNING *
  ` as LineaCompraImportacion[];
  return rows[0];
}

export interface EdicionLineaInput {
  sku?: string;
  nombre?: string;
  cantidadEsperada?: number;
  impuestosPagados?: boolean;
}

// Mismas reglas de trazabilidad que editarCompra(): lo que ya se recibió
// (y por lo tanto ya sumó stock real) no se puede contradecir.
export async function editarLinea(id: number, input: EdicionLineaInput): Promise<LineaCompraImportacion> {
  const actual = await getLineaById(id);
  if (!actual) throw new Error("Línea no encontrada");

  if (input.cantidadEsperada !== undefined && input.cantidadEsperada < actual.cantidad_recibida) {
    throw new Error(`No se puede bajar la cantidad por debajo de lo ya recibido (${actual.cantidad_recibida})`);
  }
  if (input.sku !== undefined && input.sku !== actual.sku && actual.cantidad_recibida > 0) {
    throw new Error(`No se puede cambiar el producto: ya se recibieron ${actual.cantidad_recibida} unidades como ${actual.sku}`);
  }

  // Igual que editarCompra(): solo los campos que vinieron, para que dos
  // guardados seguidos de la misma fila no se pisen.
  const viene = (k: keyof EdicionLineaInput) => input[k] !== undefined;
  const sql = getDb();
  const rows = await sql`
    UPDATE compras_importacion_lineas SET
      sku = CASE WHEN ${viene("sku")} THEN ${input.sku ?? ""} ELSE sku END,
      nombre = CASE WHEN ${viene("nombre")} THEN ${input.nombre ?? ""} ELSE nombre END,
      cantidad_esperada = CASE WHEN ${viene("cantidadEsperada")} THEN ${input.cantidadEsperada ?? 0}::int ELSE cantidad_esperada END,
      impuestos_pagados = CASE WHEN ${viene("impuestosPagados")} THEN ${input.impuestosPagados ?? false}::boolean ELSE impuestos_pagados END
    WHERE id = ${id}
    RETURNING *
  ` as LineaCompraImportacion[];
  return rows[0];
}

export async function borrarLinea(id: number): Promise<void> {
  const actual = await getLineaById(id);
  if (!actual) return;
  if (actual.cantidad_recibida > 0) {
    throw new Error(`No se puede borrar: ya se recibieron ${actual.cantidad_recibida} unidades de esta línea`);
  }
  const sql = getDb();
  const cuantas = await sql`SELECT COUNT(*)::int AS n FROM compras_importacion_lineas WHERE compra_id = ${actual.compra_id}` as { n: number }[];
  if ((cuantas[0]?.n ?? 0) <= 1) {
    throw new Error("Es el único producto de la compra — para sacarlo, borrá la compra entera");
  }
  await sql`DELETE FROM compras_importacion_lineas WHERE id = ${id}`;
}

// ─── Recepción: paso 1, solo lectura ─────────────────────────────────────────

export interface DesgloseCompra {
  compra: CompraImportacion;
  lineas: LineaCompraImportacion[];
}

export interface DesgloseEnvio {
  trackingNumber: string;
  compras: DesgloseCompra[];
}

// Un tracking puede ser un envío consolidado con varias compras adentro —
// se devuelven todas, para que el operario elija la línea correcta de
// cualquiera de ellas.
export async function resolverEscaneoRecepcion(trackingNumber: string): Promise<DesgloseEnvio | null> {
  const sql = getDb();
  const compras = await sql`
    SELECT * FROM compras_importacion WHERE tracking_number = ${trackingNumber}
    ORDER BY fecha_compra, id
  ` as CompraImportacion[];
  if (compras.length === 0) return null;

  const ids = compras.map(c => c.id);
  const lineas = await sql`
    SELECT * FROM compras_importacion_lineas WHERE compra_id = ANY(${ids}) ORDER BY id
  ` as LineaCompraImportacion[];

  return {
    trackingNumber,
    compras: compras.map(c => ({ compra: c, lineas: lineas.filter(l => l.compra_id === c.id) })),
  };
}

// ─── Recepción: paso 2, confirma una caja física puntual ─────────────────────

export interface ConfirmarCajaInput {
  compraId: number;
  lineaId: number;
  cantidad: number;
  trackingNumberEscaneado: string;
  scannedBy: string;
}

export interface ConfirmarCajaResult {
  escaneo: RecepcionEscaneo;
  linea: LineaCompraImportacion;
  compraCompleta: boolean;
}

// Neon HTTP no soporta transacciones multi-statement entre llamadas
// separadas — mismo criterio pragmático que procesarEscaneo() en
// lib/despachoDb.ts: primero el estado que importa de verdad (cuánto se
// recibió, un solo UPDATE ya atómico), después la auditoría, después el
// efecto secundario best-effort (sumar stock) — si lo último fallara, la
// caja ya se abrió y se contó físicamente, no tiene sentido revertir nada.
export async function confirmarCaja(input: ConfirmarCajaInput): Promise<ConfirmarCajaResult> {
  const sql = getDb();

  const lineaRows = await sql`
    UPDATE compras_importacion_lineas
    SET cantidad_recibida = cantidad_recibida + ${input.cantidad}
    WHERE id = ${input.lineaId} AND compra_id = ${input.compraId}
    RETURNING *
  ` as LineaCompraImportacion[];
  const linea = lineaRows[0];
  if (!linea) throw new Error("Línea de compra no encontrada");

  const escaneoRows = await sql`
    INSERT INTO recepcion_escaneos (compra_id, linea_id, tracking_number, sku, cantidad, scanned_by)
    VALUES (${input.compraId}, ${input.lineaId}, ${input.trackingNumberEscaneado}, ${linea.sku}, ${input.cantidad}, ${input.scannedBy})
    RETURNING *
  ` as RecepcionEscaneo[];
  const escaneo = escaneoRows[0];

  const compraRows = await sql`SELECT store_id FROM compras_importacion WHERE id = ${input.compraId}` as { store_id: string }[];
  const storeId = compraRows[0]?.store_id;

  try {
    if (storeId) {
      await ajustarStock(storeId, linea.sku, linea.nombre, input.cantidad, `Recepción compra #${input.compraId} (tracking ${input.trackingNumberEscaneado})`);
    }
  } catch (e) {
    console.error("[importaciones] error al sumar stock en la recepción:", e);
  }

  let compraCompleta = false;
  try {
    const todasLasLineas = await getLineasDeCompra(input.compraId);
    compraCompleta = todasLasLineas.every(l => l.cantidad_recibida >= l.cantidad_esperada);
    if (compraCompleta) {
      await sql`
        UPDATE compras_importacion
        SET fecha_llegada_real = COALESCE(fecha_llegada_real, CURRENT_DATE)
        WHERE id = ${input.compraId}
      `;
    }
  } catch (e) {
    console.error("[importaciones] error al verificar/marcar compra completa:", e);
  }

  return { escaneo, linea, compraCompleta };
}

// ─── Contadores / historial ───────────────────────────────────────────────────

function rangoDelDia(fecha?: string): { desde: string; hasta: string } {
  const d = fecha ?? new Date().toISOString().slice(0, 10);
  return { desde: d, hasta: d };
}

export interface ContadoresRecepcionDia {
  cajas: number;
  unidades: number;
  ultimoEscaneo: RecepcionEscaneo | null;
}

export async function getContadoresRecepcionHoy(fecha?: string): Promise<ContadoresRecepcionDia> {
  const sql = getDb();
  const { desde, hasta } = rangoDelDia(fecha);

  const agg = await sql`
    SELECT COUNT(*)::int AS cajas, COALESCE(SUM(cantidad), 0)::int AS unidades
    FROM recepcion_escaneos
    WHERE created_at >= ${desde}::date AND created_at < (${hasta}::date + INTERVAL '1 day')
  ` as { cajas: number; unidades: number }[];

  const ultimo = await sql`
    SELECT * FROM recepcion_escaneos
    WHERE created_at >= ${desde}::date AND created_at < (${hasta}::date + INTERVAL '1 day')
    ORDER BY created_at DESC LIMIT 1
  ` as RecepcionEscaneo[];

  return { cajas: agg[0]?.cajas ?? 0, unidades: agg[0]?.unidades ?? 0, ultimoEscaneo: ultimo[0] ?? null };
}

export interface FiltrosHistorialRecepcion {
  compraId?: number;
  tracking?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}

export async function getHistorialRecepcion(filtros: FiltrosHistorialRecepcion): Promise<RecepcionEscaneo[]> {
  const sql = getDb();
  const limit = filtros.limit ?? 200;
  const rows = await sql`
    SELECT * FROM recepcion_escaneos
    WHERE (${filtros.compraId ?? null}::int IS NULL OR compra_id = ${filtros.compraId ?? null})
      AND (${filtros.tracking ?? null}::text IS NULL OR tracking_number = ${filtros.tracking ?? null})
      AND (${filtros.desde ?? null}::date IS NULL OR created_at >= ${filtros.desde ?? null}::date)
      AND (${filtros.hasta ?? null}::date IS NULL OR created_at < (${filtros.hasta ?? null}::date + INTERVAL '1 day'))
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as RecepcionEscaneo[];
}
