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
  // Un tracking de courier internacional no se reutiliza.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS compras_importacion_tracking_uidx
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

  const lineas: LineaCompraImportacion[] = [];
  for (const linea of input.lineas) {
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
  "fechaCompra" | "fechaLlegadaEstimada" | "dap" | "pague" | "precioUsd" | "declaro" | "impuestos" | "totalArs" | "nota"
>> & { lineas?: NuevaLineaInput[] };

// Reemplaza cabecera + (opcionalmente) líneas. No permite bajar cantidad_esperada
// por debajo de lo ya recibido, ni borrar una línea con recepción > 0 — eso
// rompería la trazabilidad de algo que ya impactó stock real.
export async function editarCompra(id: number, input: EdicionCompraInput): Promise<CompraConLineas> {
  const sql = getDb();
  const actual = await getCompraById(id);
  if (!actual) throw new Error("Compra no encontrada");

  await sql`
    UPDATE compras_importacion SET
      fecha_compra = ${input.fechaCompra ?? actual.fecha_compra}::date,
      fecha_llegada_estimada = ${input.fechaLlegadaEstimada !== undefined ? input.fechaLlegadaEstimada : actual.fecha_llegada_estimada}::date,
      dap = ${input.dap !== undefined ? input.dap : actual.dap},
      pague = ${input.pague !== undefined ? input.pague : actual.pague},
      precio_usd = ${input.precioUsd !== undefined ? input.precioUsd : actual.precio_usd},
      declaro = ${input.declaro !== undefined ? input.declaro : actual.declaro},
      impuestos = ${input.impuestos !== undefined ? input.impuestos : actual.impuestos},
      total_ars = ${input.totalArs !== undefined ? input.totalArs : actual.total_ars},
      nota = ${input.nota ?? actual.nota}
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

// ─── Recepción: paso 1, solo lectura ─────────────────────────────────────────

export interface DesgloseCompra {
  compra: CompraImportacion;
  lineas: LineaCompraImportacion[];
}

export async function resolverEscaneoRecepcion(trackingNumber: string): Promise<DesgloseCompra | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM compras_importacion WHERE tracking_number = ${trackingNumber}` as CompraImportacion[];
  if (!rows[0]) return null;
  const lineas = await getLineasDeCompra(rows[0].id);
  return { compra: rows[0], lineas };
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
