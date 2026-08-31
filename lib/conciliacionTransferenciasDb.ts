import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EstadoTransferencia =
  | "PENDING" | "AUTO_MATCHED" | "REQUIRES_REVIEW" | "UNMATCHED"
  | "CONFIRMED" | "DUPLICATE_IGNORED" | "ERROR";

export interface TransferenciaBancaria {
  id: number;
  transaction_id: string;
  telegram_message_id: string | null;
  telegram_chat_id: string | null;
  sender_name: string | null;
  cuit_cuil: string | null;
  detected_dni: string | null;
  bank_account: string | null;
  amount_cents: string; // NUMERIC/BIGINT vuelve como string del driver
  received_at: string | null;
  original_message: string;
  estado: EstadoTransferencia;
  store_id: string | null;
  matched_order_id: string | null;
  matched_order_number: string | null;
  order_amount_cents: string | null;
  amount_difference_cents: string | null;
  match_dni: boolean | null;
  match_amount: boolean | null;
  match_name: boolean | null;
  match_method: boolean | null;
  candidates_json: unknown | null;
  retry_count: number;
  next_retry_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditoriaEvento {
  id: number;
  transferencia_id: number;
  evento: string;
  detalle_json: unknown | null;
  created_at: string;
}

export interface DatosDeteccion {
  transactionId: string;
  telegramMessageId?: string | null;
  telegramChatId?: string | null;
  senderName?: string | null;
  cuitCuil?: string | null;
  detectedDni?: string | null;
  bankAccount?: string | null;
  amountCents: number;
  receivedAt?: Date | null;
  originalMessage: string;
}

export interface ResultadoMatching {
  estado: EstadoTransferencia;
  storeId?: string | null;
  matchedOrderId?: string | null;
  matchedOrderNumber?: string | null;
  orderAmountCents?: number | null;
  amountDifferenceCents?: number | null;
  matchDni?: boolean | null;
  matchAmount?: boolean | null;
  matchName?: boolean | null;
  matchMethod?: boolean | null;
  candidatesJson?: unknown | null;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initConciliacionTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS transferencias_bancarias (
      id                       SERIAL PRIMARY KEY,
      transaction_id           TEXT NOT NULL UNIQUE,
      telegram_message_id      TEXT,
      telegram_chat_id         TEXT,
      sender_name              TEXT,
      cuit_cuil                TEXT,
      detected_dni             TEXT,
      bank_account             TEXT,
      amount_cents             BIGINT NOT NULL,
      received_at              TIMESTAMPTZ,
      original_message         TEXT NOT NULL,
      estado                   TEXT NOT NULL DEFAULT 'PENDING',
      store_id                 TEXT,
      matched_order_id         TEXT,
      matched_order_number     TEXT,
      order_amount_cents       BIGINT,
      amount_difference_cents  BIGINT,
      match_dni                BOOLEAN,
      match_amount             BOOLEAN,
      match_name               BOOLEAN,
      match_method             BOOLEAN,
      candidates_json          JSONB,
      retry_count              INT NOT NULL DEFAULT 0,
      next_retry_at            TIMESTAMPTZ,
      reviewed_by              TEXT,
      reviewed_at              TIMESTAMPTZ,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Un pedido no puede tener más de una conciliación activa esperando
  // confirmación al mismo tiempo (protección contra doble acreditación).
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS transferencias_bancarias_match_activo
    ON transferencias_bancarias (matched_order_id)
    WHERE estado = 'AUTO_MATCHED'
  `;
  await sql`CREATE INDEX IF NOT EXISTS transferencias_bancarias_estado ON transferencias_bancarias (estado, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS transferencias_bancarias_auditoria (
      id                SERIAL PRIMARY KEY,
      transferencia_id  INT NOT NULL REFERENCES transferencias_bancarias(id) ON DELETE CASCADE,
      evento            TEXT NOT NULL,
      detalle_json      JSONB,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Config chica (fila única) para el kill switch — vive en su propia tabla
  // en vez del env var para poder togglearse en vivo desde la UI.
  await sql`
    CREATE TABLE IF NOT EXISTS conciliacion_config (
      id                   INT PRIMARY KEY DEFAULT 1,
      auto_confirm_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      CONSTRAINT conciliacion_config_singleton CHECK (id = 1)
    )
  `;
}

// ─── Config / kill switch ────────────────────────────────────────────────────

export async function getAutoConfirmEnabled(): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`SELECT auto_confirm_enabled FROM conciliacion_config WHERE id = 1` as { auto_confirm_enabled: boolean }[];
  if (rows.length) return rows[0].auto_confirm_enabled;
  const defaultValue = process.env.PAYMENT_AUTO_CONFIRM_ENABLED === "true";
  await sql`INSERT INTO conciliacion_config (id, auto_confirm_enabled) VALUES (1, ${defaultValue}) ON CONFLICT (id) DO NOTHING`;
  return defaultValue;
}

export async function setAutoConfirmEnabled(enabled: boolean): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO conciliacion_config (id, auto_confirm_enabled) VALUES (1, ${enabled})
    ON CONFLICT (id) DO UPDATE SET auto_confirm_enabled = ${enabled}
  `;
}

// ─── Escritura ───────────────────────────────────────────────────────────────

// Idempotente por transaction_id: si ya existe, la devuelve tal cual (sin
// tocarla) y avisa vía el flag `yaExistia` — el caller registra el evento de
// duplicado y no debe volver a correr el motor de matching.
export async function crearTransferenciaDetectada(
  data: DatosDeteccion,
): Promise<{ transferencia: TransferenciaBancaria; yaExistia: boolean }> {
  const sql = getDb();
  const existente = await sql`
    SELECT * FROM transferencias_bancarias WHERE transaction_id = ${data.transactionId}
  ` as TransferenciaBancaria[];
  if (existente.length) return { transferencia: existente[0], yaExistia: true };

  const rows = await sql`
    INSERT INTO transferencias_bancarias (
      transaction_id, telegram_message_id, telegram_chat_id, sender_name,
      cuit_cuil, detected_dni, bank_account, amount_cents, received_at, original_message
    ) VALUES (
      ${data.transactionId}, ${data.telegramMessageId ?? null}, ${data.telegramChatId ?? null}, ${data.senderName ?? null},
      ${data.cuitCuil ?? null}, ${data.detectedDni ?? null}, ${data.bankAccount ?? null}, ${data.amountCents},
      ${data.receivedAt ? data.receivedAt.toISOString() : null}, ${data.originalMessage}
    )
    ON CONFLICT (transaction_id) DO NOTHING
    RETURNING *
  ` as TransferenciaBancaria[];

  // Carrera: alguien insertó entre el SELECT y el INSERT — releer.
  if (!rows.length) {
    const reread = await sql`SELECT * FROM transferencias_bancarias WHERE transaction_id = ${data.transactionId}` as TransferenciaBancaria[];
    return { transferencia: reread[0], yaExistia: true };
  }
  return { transferencia: rows[0], yaExistia: false };
}

export async function actualizarResultadoMatching(id: number, r: ResultadoMatching): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE transferencias_bancarias SET
      estado = ${r.estado},
      store_id = ${r.storeId ?? null},
      matched_order_id = ${r.matchedOrderId ?? null},
      matched_order_number = ${r.matchedOrderNumber ?? null},
      order_amount_cents = ${r.orderAmountCents ?? null},
      amount_difference_cents = ${r.amountDifferenceCents ?? null},
      match_dni = ${r.matchDni ?? null},
      match_amount = ${r.matchAmount ?? null},
      match_name = ${r.matchName ?? null},
      match_method = ${r.matchMethod ?? null},
      candidates_json = ${r.candidatesJson ? JSON.stringify(r.candidatesJson) : null},
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function marcarError(id: number, proximoReintento: Date | null): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE transferencias_bancarias SET
      estado = 'ERROR', retry_count = retry_count + 1,
      next_retry_at = ${proximoReintento ? proximoReintento.toISOString() : null},
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function confirmarTransferencia(id: number, resueltoPor: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE transferencias_bancarias SET
      estado = 'CONFIRMED', reviewed_by = ${resueltoPor}, reviewed_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
  `;
}

// Vincula a mano un pedido a una transferencia en revisión — queda como
// "AUTO_MATCHED" igual que un match automático (mismas acciones disponibles:
// abrir el pedido en Tiendanube, y confirmar una vez pagado ahí), pero
// registrando quién lo vinculó.
export async function vincularManualmente(
  id: number, storeId: string, orderId: string, orderNumber: string, resueltoPor: string,
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE transferencias_bancarias SET
      estado = 'AUTO_MATCHED', store_id = ${storeId}, matched_order_id = ${orderId}, matched_order_number = ${orderNumber},
      reviewed_by = ${resueltoPor}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function descartarTransferencia(id: number, resueltoPor: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE transferencias_bancarias SET
      estado = 'DUPLICATE_IGNORED', reviewed_by = ${resueltoPor}, reviewed_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function registrarAuditoria(transferenciaId: number, evento: string, detalle?: unknown): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO transferencias_bancarias_auditoria (transferencia_id, evento, detalle_json)
    VALUES (${transferenciaId}, ${evento}, ${detalle !== undefined ? JSON.stringify(detalle) : null})
  `;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export interface FiltrosTransferencias {
  estado?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  dni?: string;
  nombre?: string;
  pedido?: string;
  transactionId?: string;
}

export async function getTransferencias(filtros: FiltrosTransferencias = {}): Promise<TransferenciaBancaria[]> {
  const sql = getDb();
  const dni = filtros.dni?.trim() || null;
  const nombre = filtros.nombre?.trim() || null;
  const pedido = filtros.pedido?.trim() || null;
  const transactionId = filtros.transactionId?.trim() || null;
  const rows = await sql`
    SELECT * FROM transferencias_bancarias
    WHERE (${filtros.estado ?? null}::text IS NULL OR estado = ${filtros.estado ?? null})
      AND (${filtros.fechaDesde ?? null}::date IS NULL OR created_at >= ${filtros.fechaDesde ?? null}::date)
      AND (${filtros.fechaHasta ?? null}::date IS NULL OR created_at < (${filtros.fechaHasta ?? null}::date + INTERVAL '1 day'))
      AND (${dni}::text IS NULL OR detected_dni ILIKE '%' || ${dni} || '%')
      AND (${nombre}::text IS NULL OR sender_name ILIKE '%' || ${nombre} || '%')
      AND (${pedido}::text IS NULL OR matched_order_number ILIKE '%' || ${pedido} || '%')
      AND (${transactionId}::text IS NULL OR transaction_id ILIKE '%' || ${transactionId} || '%')
    ORDER BY created_at DESC
    LIMIT 500
  `;
  return rows as TransferenciaBancaria[];
}

export async function getTransferenciaById(id: number): Promise<TransferenciaBancaria | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM transferencias_bancarias WHERE id = ${id}` as TransferenciaBancaria[];
  return rows[0] ?? null;
}

export async function getAuditoria(transferenciaId: number): Promise<AuditoriaEvento[]> {
  const sql = getDb();
  return await sql`
    SELECT * FROM transferencias_bancarias_auditoria WHERE transferencia_id = ${transferenciaId} ORDER BY created_at ASC
  ` as AuditoriaEvento[];
}

export async function getKpisHoy(): Promise<Record<string, number>> {
  const sql = getDb();
  const rows = await sql`
    SELECT estado, COUNT(*)::int AS count FROM transferencias_bancarias
    WHERE created_at >= date_trunc('day', NOW())
    GROUP BY estado
  ` as { estado: string; count: number }[];
  const result: Record<string, number> = {};
  for (const r of rows) result[r.estado] = r.count;
  return result;
}

export async function getTransferenciasPendientesDeReintento(): Promise<TransferenciaBancaria[]> {
  const sql = getDb();
  return await sql`
    SELECT * FROM transferencias_bancarias
    WHERE estado = 'ERROR' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY created_at ASC
  ` as TransferenciaBancaria[];
}
