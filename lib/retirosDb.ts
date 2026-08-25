import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const CANAL_PEDIDO_RETIRO = ["tiendanube", "mercadolibre"] as const;
export type CanalPedidoRetiro = (typeof CANAL_PEDIDO_RETIRO)[number];

export const ESTADOS_RETIRO = ["pendiente_preparar", "listo", "retirado", "cancelado"] as const;
export type EstadoRetiro = (typeof ESTADOS_RETIRO)[number];

export const ESTADOS_PAGO_RETIRO = ["pagado", "pendiente", "cobrar_al_retirar"] as const;
export type EstadoPagoRetiro = (typeof ESTADOS_PAGO_RETIRO)[number];

export const MEDIOS_PAGO_RETIRO = ["efectivo", "transferencia", "tarjeta", "mercado_pago", "otro"] as const;
export type MedioPagoRetiro = (typeof MEDIOS_PAGO_RETIRO)[number];

export interface ProductoRetiro {
  sku: string | null;
  nombre: string;
  cantidad: number;
  precio: number | null;
}

export interface Retiro {
  id: number;
  store_id: string;
  codigo: string;

  canal_pedido: CanalPedidoRetiro | null;
  numero_pedido: string | null;
  pedido_id_interno: string | null;
  pedido_pagado_original: boolean | null;
  pedido_metodo_entrega_original: string | null;
  pedido_tracking_original: string | null;

  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_dni: string | null;

  productos_json: ProductoRetiro[];
  total: string;

  estado_retiro: EstadoRetiro;
  estado_pago: EstadoPagoRetiro;
  medio_pago: MedioPagoRetiro | null;

  fecha_estimada: string | null;
  notas: string | null;

  entregado_por: string | null;
  entregado_at: string | null;
  cancelado_at: string | null;
  cancelado_motivo: string | null;

  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RetiroHistorialEntry {
  id: number;
  retiro_id: number;
  tipo: string;
  descripcion: string;
  metadata: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface RetiroDetalle extends Retiro {
  historial: RetiroHistorialEntry[];
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initRetirosTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS retiros (
      id                              SERIAL PRIMARY KEY,
      store_id                        TEXT NOT NULL,
      codigo                          TEXT NOT NULL DEFAULT '',

      canal_pedido                    TEXT,
      numero_pedido                   TEXT,
      pedido_id_interno               TEXT,
      pedido_pagado_original          BOOLEAN,
      pedido_metodo_entrega_original  TEXT,
      pedido_tracking_original        TEXT,

      cliente_nombre                  TEXT NOT NULL DEFAULT '',
      cliente_telefono                TEXT,
      cliente_email                   TEXT,
      cliente_dni                     TEXT,

      productos_json                  JSONB NOT NULL DEFAULT '[]',
      total                           NUMERIC(12,2) NOT NULL DEFAULT 0,

      estado_retiro                   TEXT NOT NULL DEFAULT 'pendiente_preparar',
      estado_pago                     TEXT NOT NULL DEFAULT 'pendiente',
      medio_pago                      TEXT,

      fecha_estimada                  DATE,
      notas                           TEXT,

      entregado_por                   TEXT,
      entregado_at                    TIMESTAMPTZ,
      cancelado_at                    TIMESTAMPTZ,
      cancelado_motivo                TEXT,

      created_by                      TEXT NOT NULL DEFAULT '',
      created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS retiros_store_codigo ON retiros (store_id, codigo)`;
  await sql`CREATE INDEX IF NOT EXISTS retiros_store_estado ON retiros (store_id, estado_retiro, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS retiros_store_pedido ON retiros (store_id, numero_pedido)`;
  await sql`ALTER TABLE retiros ADD COLUMN IF NOT EXISTS medio_pago TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS retiros_historial (
      id            SERIAL PRIMARY KEY,
      retiro_id     INTEGER NOT NULL REFERENCES retiros(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL,
      descripcion   TEXT NOT NULL,
      metadata      JSONB,
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS retiros_historial_retiro ON retiros_historial (retiro_id, created_at)`;
}

// ─── Historial ──────────────────────────────────────────────────────────────

export async function addHistorialRetiro(
  retiroId: number,
  tipo: string,
  descripcion: string,
  createdBy: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO retiros_historial (retiro_id, tipo, descripcion, metadata, created_by)
    VALUES (${retiroId}, ${tipo}, ${descripcion}, ${metadata ? JSON.stringify(metadata) : null}, ${createdBy})
  `;
}

// ─── Lectura: listado / dashboard ────────────────────────────────────────────

export interface RetiroFiltros {
  q?: string;
  estadoRetiro?: string;
  estadoPago?: string;
  canal?: string;
  fecha?: string; // "hoy" | "manana" | fecha ISO puntual
}

export async function getRetiros(storeId: string, filtros: RetiroFiltros = {}): Promise<Retiro[]> {
  const sql = getDb();
  const q = filtros.q?.trim() || null;

  let fechaDesde: string | null = null;
  if (filtros.fecha === "hoy") {
    fechaDesde = new Date().toISOString().slice(0, 10);
  } else if (filtros.fecha === "manana") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    fechaDesde = d.toISOString().slice(0, 10);
  } else if (filtros.fecha) {
    fechaDesde = filtros.fecha;
  }

  const rows = await sql`
    SELECT * FROM retiros
    WHERE store_id = ${storeId}
      AND (${q}::text IS NULL OR
        codigo ILIKE '%' || ${q} || '%' OR
        numero_pedido ILIKE '%' || ${q} || '%' OR
        cliente_nombre ILIKE '%' || ${q} || '%' OR
        cliente_telefono ILIKE '%' || ${q} || '%' OR
        cliente_email ILIKE '%' || ${q} || '%' OR
        CAST(id AS TEXT) = ${q}
      )
      AND (${filtros.estadoRetiro ?? null}::text IS NULL OR estado_retiro = ${filtros.estadoRetiro ?? null})
      AND (${filtros.estadoPago ?? null}::text IS NULL OR estado_pago = ${filtros.estadoPago ?? null})
      AND (${filtros.canal ?? null}::text IS NULL OR canal_pedido = ${filtros.canal ?? null})
      AND (${fechaDesde}::date IS NULL OR fecha_estimada = ${fechaDesde}::date)
    ORDER BY
      CASE estado_retiro WHEN 'pendiente_preparar' THEN 0 WHEN 'listo' THEN 1 WHEN 'retirado' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 300
  `;
  return rows as Retiro[];
}

export interface RetiroCounts {
  pendientesPreparar: number;
  listos: number;
  paraHoy: number;
  cobrosPendientes: number;
}

export async function getRetiroCounts(storeId: string): Promise<RetiroCounts> {
  const sql = getDb();
  const hoy = new Date().toISOString().slice(0, 10);
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE estado_retiro = 'pendiente_preparar') AS pendientes_preparar,
      COUNT(*) FILTER (WHERE estado_retiro = 'listo') AS listos,
      COUNT(*) FILTER (WHERE fecha_estimada = ${hoy}::date AND estado_retiro NOT IN ('retirado','cancelado')) AS para_hoy,
      COUNT(*) FILTER (WHERE estado_pago IN ('pendiente','cobrar_al_retirar') AND estado_retiro NOT IN ('retirado','cancelado')) AS cobros_pendientes
    FROM retiros
    WHERE store_id = ${storeId}
  ` as { pendientes_preparar: string; listos: string; para_hoy: string; cobros_pendientes: string }[];
  const r = rows[0];
  return {
    pendientesPreparar: Number(r?.pendientes_preparar ?? 0),
    listos: Number(r?.listos ?? 0),
    paraHoy: Number(r?.para_hoy ?? 0),
    cobrosPendientes: Number(r?.cobros_pendientes ?? 0),
  };
}

// ─── Lectura: detalle ─────────────────────────────────────────────────────────

export async function getRetiroById(storeId: string, id: number): Promise<RetiroDetalle | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM retiros WHERE store_id = ${storeId} AND id = ${id}` as Retiro[];
  const retiro = rows[0];
  if (!retiro) return null;

  const historial = await sql`
    SELECT * FROM retiros_historial WHERE retiro_id = ${id} ORDER BY created_at DESC
  ` as RetiroHistorialEntry[];

  return { ...retiro, historial };
}

// Retiro abierto (no retirado/cancelado) para el mismo pedido — prevención
// de duplicados al vincular un pedido que ya tiene un retiro en curso.
export async function getRetiroAbiertoPorPedido(
  storeId: string, canalPedido: string, numeroPedido: string,
): Promise<{ id: number; codigo: string } | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, codigo FROM retiros
    WHERE store_id = ${storeId} AND canal_pedido = ${canalPedido} AND numero_pedido = ${numeroPedido}
      AND estado_retiro NOT IN ('retirado', 'cancelado')
    LIMIT 1
  ` as { id: number; codigo: string }[];
  return rows[0] ?? null;
}

// ─── Escritura ────────────────────────────────────────────────────────────────

export interface CreateRetiroData {
  canalPedido?: CanalPedidoRetiro | null;
  numeroPedido?: string | null;
  pedidoIdInterno?: string | null;
  pedidoPagadoOriginal?: boolean | null;
  pedidoMetodoEntregaOriginal?: string | null;
  pedidoTrackingOriginal?: string | null;
  clienteNombre: string;
  clienteTelefono?: string | null;
  clienteEmail?: string | null;
  clienteDni?: string | null;
  productos: ProductoRetiro[];
  total: number;
  estadoPago: EstadoPagoRetiro;
  medioPago?: MedioPagoRetiro | null;
  fechaEstimada?: string | null;
  notas?: string | null;
  createdBy: string;
}

export async function createRetiro(storeId: string, data: CreateRetiroData): Promise<Retiro> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO retiros (
      store_id, canal_pedido, numero_pedido, pedido_id_interno,
      pedido_pagado_original, pedido_metodo_entrega_original, pedido_tracking_original,
      cliente_nombre, cliente_telefono, cliente_email, cliente_dni,
      productos_json, total, estado_pago, medio_pago, fecha_estimada, notas, created_by
    ) VALUES (
      ${storeId}, ${data.canalPedido ?? null}, ${data.numeroPedido ?? null}, ${data.pedidoIdInterno ?? null},
      ${data.pedidoPagadoOriginal ?? null}, ${data.pedidoMetodoEntregaOriginal ?? null}, ${data.pedidoTrackingOriginal ?? null},
      ${data.clienteNombre}, ${data.clienteTelefono ?? null}, ${data.clienteEmail ?? null}, ${data.clienteDni ?? null},
      ${JSON.stringify(data.productos)}, ${data.total}, ${data.estadoPago}, ${data.medioPago ?? null}, ${data.fechaEstimada ?? null}, ${data.notas ?? null}, ${data.createdBy}
    )
    RETURNING *
  ` as Retiro[];
  const retiro = rows[0];

  const codigo = `RP-${String(retiro.id).padStart(6, "0")}`;
  const conCodigo = await sql`UPDATE retiros SET codigo = ${codigo} WHERE id = ${retiro.id} RETURNING *` as Retiro[];

  await addHistorialRetiro(
    retiro.id, "creacion",
    data.numeroPedido
      ? `${data.createdBy} creó el retiro ${codigo} a partir del pedido #${data.numeroPedido}`
      : `${data.createdBy} creó el retiro ${codigo} (carga manual, sin pedido)`,
    data.createdBy,
  );
  return conCodigo[0];
}

export interface UpdateRetiroCamposData {
  fechaEstimada?: string | null;
  notas?: string | null;
}

export async function updateRetiroCampos(
  storeId: string, id: number, data: UpdateRetiroCamposData, updatedBy: string,
): Promise<Retiro | null> {
  const sql = getDb();
  const current = await sql`SELECT * FROM retiros WHERE store_id = ${storeId} AND id = ${id}` as Retiro[];
  if (!current.length) return null;
  const actual = current[0];

  const fechaEstimada = data.fechaEstimada !== undefined ? data.fechaEstimada : actual.fecha_estimada;
  const notas = data.notas !== undefined ? data.notas : actual.notas;

  const rows = await sql`
    UPDATE retiros SET fecha_estimada = ${fechaEstimada}, notas = ${notas}, updated_at = NOW()
    WHERE store_id = ${storeId} AND id = ${id}
    RETURNING *
  ` as Retiro[];

  if (data.fechaEstimada !== undefined && data.fechaEstimada !== actual.fecha_estimada) {
    await addHistorialRetiro(id, "otro", `${updatedBy} cambió la fecha estimada de retiro`, updatedBy, { from: actual.fecha_estimada, to: data.fechaEstimada });
  }
  if (data.notas !== undefined && data.notas !== actual.notas) {
    await addHistorialRetiro(id, "otro", `${updatedBy} actualizó las notas`, updatedBy);
  }

  return rows[0] ?? null;
}

export async function marcarListo(storeId: string, id: number, by: string): Promise<Retiro | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE retiros SET estado_retiro = 'listo', updated_at = NOW()
    WHERE store_id = ${storeId} AND id = ${id} AND estado_retiro IN ('pendiente_preparar','listo')
    RETURNING *
  ` as Retiro[];
  if (!rows.length) return null;
  await addHistorialRetiro(id, "otro", `${by} marcó el retiro como listo para retirar`, by);
  return rows[0];
}

export async function registrarCobro(
  storeId: string, id: number, by: string, medioPago?: MedioPagoRetiro | null,
): Promise<Retiro | null> {
  const sql = getDb();
  const current = await sql`SELECT medio_pago FROM retiros WHERE store_id = ${storeId} AND id = ${id}` as { medio_pago: string | null }[];
  if (!current.length) return null;
  const medioPagoFinal = medioPago ?? current[0].medio_pago;
  const rows = await sql`
    UPDATE retiros SET estado_pago = 'pagado', medio_pago = ${medioPagoFinal}, updated_at = NOW()
    WHERE store_id = ${storeId} AND id = ${id} AND estado_pago != 'pagado'
    RETURNING *
  ` as Retiro[];
  if (!rows.length) return null;
  await addHistorialRetiro(
    id, "otro",
    `${by} registró el cobro de $${rows[0].total}${medioPagoFinal ? ` (${medioPagoFinal.replace("_", " ")})` : ""}`,
    by,
  );
  return rows[0];
}

export interface ConfirmarEntregaResult {
  ok: true; retiro: Retiro;
}
export interface ConfirmarEntregaError {
  ok: false; error: "no_encontrado" | "ya_retirado" | "saldo_pendiente";
}

export async function confirmarEntrega(
  storeId: string, id: number, by: string,
  opts: { pagoConfirmado?: boolean; overrideSupervisor?: boolean; medioPago?: MedioPagoRetiro | null },
): Promise<ConfirmarEntregaResult | ConfirmarEntregaError> {
  const sql = getDb();
  const current = await sql`SELECT * FROM retiros WHERE store_id = ${storeId} AND id = ${id}` as Retiro[];
  if (!current.length) return { ok: false, error: "no_encontrado" };
  const actual = current[0];
  if (actual.estado_retiro === "retirado") return { ok: false, error: "ya_retirado" };

  let estadoPago = actual.estado_pago;
  if (estadoPago !== "pagado") {
    if (opts.pagoConfirmado) {
      estadoPago = "pagado";
    } else if (!opts.overrideSupervisor) {
      return { ok: false, error: "saldo_pendiente" };
    }
  }
  const medioPago = opts.medioPago ?? actual.medio_pago;

  const rows = await sql`
    UPDATE retiros SET
      estado_retiro = 'retirado', estado_pago = ${estadoPago}, medio_pago = ${medioPago},
      entregado_por = ${by}, entregado_at = NOW(), updated_at = NOW()
    WHERE store_id = ${storeId} AND id = ${id}
    RETURNING *
  ` as Retiro[];

  if (opts.pagoConfirmado && actual.estado_pago !== "pagado") {
    await addHistorialRetiro(id, "otro", `${by} cobró $${actual.total} al momento de la entrega${medioPago ? ` (${medioPago.replace("_", " ")})` : ""}`, by);
  } else if (opts.overrideSupervisor && actual.estado_pago !== "pagado") {
    await addHistorialRetiro(id, "otro", `${by} entregó el retiro con saldo pendiente (autorización de supervisor)`, by, { estadoPago: actual.estado_pago });
  }
  await addHistorialRetiro(id, "otro", `${by} confirmó la entrega del retiro`, by);

  return { ok: true, retiro: rows[0] };
}

export async function cancelarRetiro(storeId: string, id: number, motivo: string | null, by: string): Promise<Retiro | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE retiros SET estado_retiro = 'cancelado', cancelado_at = NOW(), cancelado_motivo = ${motivo}, updated_at = NOW()
    WHERE store_id = ${storeId} AND id = ${id} AND estado_retiro NOT IN ('retirado','cancelado')
    RETURNING *
  ` as Retiro[];
  if (!rows.length) return null;
  await addHistorialRetiro(id, "otro", `${by} canceló el retiro${motivo ? `: ${motivo}` : ""}`, by);
  return rows[0];
}

// Borrado duro — para corregir una carga por error, no para el flujo normal
// (que es cancelar). Reservado a supervisión.
export async function deleteRetiro(storeId: string, id: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`DELETE FROM retiros WHERE store_id = ${storeId} AND id = ${id} RETURNING id` as { id: number }[];
  return rows.length > 0;
}
