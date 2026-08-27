import { getDb } from "./db";
import { initFinanzasTables, createGastoNegocio, deleteGastoNegocio } from "./finanzasDb";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const ESTADOS_TICKET = [
  "nuevo",
  "pendiente_supervision",
  "en_gestion",
  "esperando_cliente",
  "esperando_pago",
  "esperando_devolucion",
  "esperando_logistica",
  "resuelto",
  "cerrado",
  "cancelado",
] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export const CANAL_PEDIDO = ["tiendanube", "mercadolibre"] as const;
export type CanalPedido = (typeof CANAL_PEDIDO)[number];

// Mismo vocabulario que ya usa Soporte para el canal de contacto.
export const CANALES_CONTACTO = ["WhatsApp", "Instagram", "Email", "Trusty", "Otro"] as const;

// "generar_envio" unifica lo que antes eran 4 botones separados (enviar
// producto, cambiar producto, crear pedido, reenviar pedido) — todos
// terminaban haciendo lo mismo: registrar la acción y, opcionalmente,
// generar un Cambio real para Andreani. El detalle libre de la acción
// aclara qué se está mandando exactamente.
export const TIPOS_ACCION = [
  "generar_envio",
  "producto_faltante",
  "modificar_pedido",
  "cambiar_direccion",
  "generar_devolucion",
  "reembolso",
  "cancelar_pedido",
  "generar_link_pago",
  "resolver_sin_costo",
  "otra_accion",
] as const;
export type TipoAccion = (typeof TIPOS_ACCION)[number];

export const TIPOS_COSTO = ["producto_enviado", "envio", "devolucion", "reembolso", "otro"] as const;
export type TipoCosto = (typeof TIPOS_COSTO)[number];

export interface ProductoPedidoTicket {
  sku: string | null;
  nombre: string;
  cantidad: number;
  precio: number | null;
}

export interface Ticket {
  id: number;
  // Nulos para tickets sin pedido vinculado — hoy solo la categoría
  // "crear_orden_compra" crea así, porque por definición el pedido
  // todavía no existe en Tienda Nube/Mercado Libre.
  canal_pedido: CanalPedido | null;
  numero_pedido: string | null;
  pedido_id_interno: string | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_instagram: string | null;
  cliente_dni: string | null;
  cliente_direccion: string | null;
  pedido_total: string | null;
  pedido_moneda: string | null;
  pedido_fecha: string | null;
  pedido_estado: string | null;
  pedido_transportista: string | null;
  pedido_tracking: string | null;
  pedido_productos_json: ProductoPedidoTicket[] | null;
  categoria: string;
  subcategoria_1: string | null;
  subcategoria_2: string | null;
  canal_contacto: string | null;
  descripcion: string | null;
  troubleshooting: string | null;
  marca: string | null;
  // Solo se usan cuando categoria = "hacer_factura". factura_datos es texto
  // libre (CUIT/Razón Social/Condición IVA/Dirección fiscal pegados de una
  // vez por la persona de atención al cliente); factura_forma_pago se carga
  // después, dentro del ticket, cuando se gestiona la factura.
  factura_datos: string | null;
  factura_forma_pago: string | null;
  // Solo se usa cuando categoria = "crear_orden_compra" — texto libre, no
  // hay grilla de productos para este tipo de ticket (no existe un pedido
  // real del que traerlos).
  orden_compra_productos: string | null;
  estado: EstadoTicket;
  prioridad: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  valor_comercial: string | null;
  sla_vencimiento: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  resuelto_at: string | null;
  cerrado_at: string | null;
}

export interface TicketAccion {
  id: number;
  caso_id: number;
  tipo: TipoAccion;
  detalle: string | null;
  monto: string | null;
  referencia: string | null;
  estado: string;
  created_by: string;
  created_at: string;
}

export interface TicketCosto {
  id: number;
  caso_id: number;
  tipo: TipoCosto;
  descripcion: string | null;
  monto: string;
  sku: string | null;
  // Vínculo blando (no FK) al gasto que este costo generó en Finanzas
  // (gastos_negocio, módulo independiente) — null si por algún motivo no
  // se pudo crear el gasto.
  gasto_id: number | null;
  created_by: string;
  created_at: string;
}

export interface TicketAdjunto {
  id: number;
  caso_id: number;
  accion_id: number | null;
  // Vínculo blando (no FK) a un Cambio del módulo Cambios — comprobante/
  // etiqueta de Andreani subido para ese envío puntual. Sin FK dura por el
  // mismo motivo que cambios.ticket_caso_id: son módulos independientes.
  cambio_id: number | null;
  url: string;
  public_id: string | null;
  resource_type: string;
  nombre_archivo: string | null;
  created_by: string;
  created_at: string;
}

export interface TicketComentario {
  id: number;
  caso_id: number;
  texto: string;
  created_by: string;
  created_at: string;
}

export interface TicketHistorialEntry {
  id: number;
  caso_id: number;
  tipo: string;
  descripcion: string;
  metadata: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface TicketDetalle extends Ticket {
  acciones: TicketAccion[];
  costos: TicketCosto[];
  costoTotal: number;
  adjuntos: TicketAdjunto[];
  comentarios: TicketComentario[];
  historial: TicketHistorialEntry[];
}

export interface TicketResumenCliente {
  id: number;
  numero_pedido: string;
  categoria: string;
  estado: EstadoTicket;
  created_at: string;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initTicketsTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS casos (
      id                    SERIAL PRIMARY KEY,
      store_id              TEXT NOT NULL,

      canal_pedido          TEXT,
      numero_pedido         TEXT,
      pedido_id_interno     TEXT,

      cliente_nombre        TEXT NOT NULL DEFAULT '',
      cliente_telefono      TEXT,
      cliente_email         TEXT,
      cliente_instagram     TEXT,
      cliente_dni           TEXT,
      cliente_direccion     TEXT,

      pedido_total          NUMERIC(12,2),
      pedido_moneda         TEXT,
      pedido_fecha          TIMESTAMPTZ,
      pedido_estado         TEXT,
      pedido_transportista  TEXT,
      pedido_tracking       TEXT,
      pedido_productos_json JSONB,

      categoria             TEXT NOT NULL,
      subcategoria_1        TEXT,
      subcategoria_2        TEXT,

      canal_contacto        TEXT,
      descripcion           TEXT,
      troubleshooting       TEXT,
      marca                 TEXT,

      factura_datos         TEXT,
      factura_forma_pago    TEXT,
      orden_compra_productos TEXT,

      estado                TEXT NOT NULL DEFAULT 'nuevo',
      prioridad             TEXT NOT NULL DEFAULT 'normal',
      responsable_id        TEXT,
      responsable_nombre    TEXT,

      valor_comercial       NUMERIC(12,2),

      sla_vencimiento       TIMESTAMPTZ,

      created_by            TEXT NOT NULL DEFAULT '',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resuelto_at           TIMESTAMPTZ,
      cerrado_at            TIMESTAMPTZ
    )
  `;
  await sql`ALTER TABLE casos ADD COLUMN IF NOT EXISTS cliente_instagram TEXT`;
  // Migración: pedido vinculado pasa a ser opcional — "crear_orden_compra"
  // registra un ticket sin pedido real (todavía no existe en Tienda Nube).
  await sql`ALTER TABLE casos ALTER COLUMN canal_pedido DROP NOT NULL`;
  await sql`ALTER TABLE casos ALTER COLUMN numero_pedido DROP NOT NULL`;
  // Los 4 campos separados de facturación (CUIT/Razón Social/Condición
  // IVA/Dirección fiscal) se simplificaron a un solo campo de texto libre
  // antes de que ningún ticket real los usara.
  await sql`ALTER TABLE casos DROP COLUMN IF EXISTS factura_cuit`;
  await sql`ALTER TABLE casos DROP COLUMN IF EXISTS factura_razon_social`;
  await sql`ALTER TABLE casos DROP COLUMN IF EXISTS factura_condicion_iva`;
  await sql`ALTER TABLE casos DROP COLUMN IF EXISTS factura_direccion_fiscal`;
  await sql`ALTER TABLE casos ADD COLUMN IF NOT EXISTS factura_datos TEXT`;
  await sql`ALTER TABLE casos ADD COLUMN IF NOT EXISTS factura_forma_pago TEXT`;
  await sql`ALTER TABLE casos ADD COLUMN IF NOT EXISTS orden_compra_productos TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS casos_store_estado  ON casos (store_id, estado, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS casos_store_pedido  ON casos (store_id, numero_pedido)`;
  await sql`CREATE INDEX IF NOT EXISTS casos_store_tel     ON casos (store_id, cliente_telefono)`;
  await sql`CREATE INDEX IF NOT EXISTS casos_store_mail    ON casos (store_id, cliente_email)`;
  await sql`CREATE INDEX IF NOT EXISTS casos_store_dni     ON casos (store_id, cliente_dni)`;

  await sql`
    CREATE TABLE IF NOT EXISTS caso_acciones (
      id            SERIAL PRIMARY KEY,
      caso_id       INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL,
      detalle       TEXT,
      monto         NUMERIC(12,2),
      referencia    TEXT,
      estado        TEXT NOT NULL DEFAULT 'registrada',
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS caso_acciones_caso ON caso_acciones (caso_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS caso_costos (
      id            SERIAL PRIMARY KEY,
      caso_id       INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL,
      descripcion   TEXT,
      monto         NUMERIC(12,2) NOT NULL,
      sku           TEXT,
      gasto_id      INTEGER,
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS caso_costos_caso ON caso_costos (caso_id)`;
  // Migración: vínculo opcional al gasto que este costo generó en Finanzas.
  await sql`ALTER TABLE caso_costos ADD COLUMN IF NOT EXISTS gasto_id INTEGER`;

  await sql`
    CREATE TABLE IF NOT EXISTS caso_adjuntos (
      id              SERIAL PRIMARY KEY,
      caso_id         INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
      accion_id       INTEGER REFERENCES caso_acciones(id) ON DELETE SET NULL,
      cambio_id       INTEGER,
      url             TEXT NOT NULL,
      public_id       TEXT,
      resource_type   TEXT NOT NULL DEFAULT 'image',
      nombre_archivo  TEXT,
      created_by      TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS caso_adjuntos_caso ON caso_adjuntos (caso_id)`;
  await sql`ALTER TABLE caso_adjuntos ADD COLUMN IF NOT EXISTS cambio_id INTEGER`;

  await sql`
    CREATE TABLE IF NOT EXISTS caso_comentarios (
      id            SERIAL PRIMARY KEY,
      caso_id       INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
      texto         TEXT NOT NULL,
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS caso_comentarios_caso ON caso_comentarios (caso_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS caso_historial (
      id            SERIAL PRIMARY KEY,
      caso_id       INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL,
      descripcion   TEXT NOT NULL,
      metadata      JSONB,
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS caso_historial_caso ON caso_historial (caso_id, created_at)`;
}

// ─── Historial ──────────────────────────────────────────────────────────────
// Exportada además de usarse internamente: rutas que integran Tickets con
// otro módulo (ej. generar un Cambio para Andreani) necesitan poder dejar
// su propia fila en la timeline sin duplicar el INSERT acá.

export async function addHistorial(
  casoId: number,
  tipo: string,
  descripcion: string,
  createdBy: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO caso_historial (caso_id, tipo, descripcion, metadata, created_by)
    VALUES (${casoId}, ${tipo}, ${descripcion}, ${metadata ? JSON.stringify(metadata) : null}, ${createdBy})
  `;
}

// ─── Lectura: listado / dashboard ────────────────────────────────────────────

export interface TicketFiltros {
  q?: string;
  estado?: string;
  categoria?: string;
  canalContacto?: string;
  prioridad?: string;
  responsableId?: string;
  marca?: string;
  producto?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export async function getTickets(storeId: string, filtros: TicketFiltros = {}): Promise<Ticket[]> {
  const sql = getDb();
  const q = filtros.q?.trim() || null;
  const rows = await sql`
    SELECT * FROM casos
    WHERE store_id = ${storeId}
      AND (${q}::text IS NULL OR
        numero_pedido ILIKE '%' || ${q} || '%' OR
        cliente_nombre ILIKE '%' || ${q} || '%' OR
        cliente_telefono ILIKE '%' || ${q} || '%' OR
        cliente_email ILIKE '%' || ${q} || '%' OR
        cliente_dni ILIKE '%' || ${q} || '%' OR
        pedido_tracking ILIKE '%' || ${q} || '%' OR
        CAST(id AS TEXT) = ${q}
      )
      AND (${filtros.estado ?? null}::text IS NULL OR estado = ${filtros.estado ?? null})
      AND (${filtros.categoria ?? null}::text IS NULL OR categoria = ${filtros.categoria ?? null})
      AND (${filtros.canalContacto ?? null}::text IS NULL OR canal_contacto = ${filtros.canalContacto ?? null})
      AND (${filtros.prioridad ?? null}::text IS NULL OR prioridad = ${filtros.prioridad ?? null})
      AND (${filtros.responsableId ?? null}::text IS NULL OR responsable_id = ${filtros.responsableId ?? null})
      AND (${filtros.marca ?? null}::text IS NULL OR marca = ${filtros.marca ?? null})
      AND (${filtros.producto ?? null}::text IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(pedido_productos_json, '[]'::jsonb)) elem
        WHERE elem->>'sku' ILIKE '%' || ${filtros.producto ?? null} || '%'
           OR elem->>'nombre' ILIKE '%' || ${filtros.producto ?? null} || '%'
      ))
      AND (${filtros.fechaDesde ?? null}::date IS NULL OR created_at >= ${filtros.fechaDesde ?? null}::date)
      AND (${filtros.fechaHasta ?? null}::date IS NULL OR created_at < (${filtros.fechaHasta ?? null}::date + INTERVAL '1 day'))
    ORDER BY created_at DESC
    LIMIT 300
  `;
  return rows as Ticket[];
}

export interface TicketCounts {
  totalAbiertos: number;
  pendientesSupervision: number;
  enGestion: number;
  esperandoCliente: number;
  esperandoDevolucion: number;
  urgentes: number;
  slaVencidos: number;
}

const ESTADOS_ABIERTOS = ["nuevo", "pendiente_supervision", "en_gestion", "esperando_cliente", "esperando_pago", "esperando_devolucion", "esperando_logistica"];

export async function getTicketCounts(storeId: string): Promise<TicketCounts> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE estado = ANY(${ESTADOS_ABIERTOS})) AS total_abiertos,
      COUNT(*) FILTER (WHERE estado = 'pendiente_supervision') AS pendientes_supervision,
      COUNT(*) FILTER (WHERE estado = 'en_gestion') AS en_gestion,
      COUNT(*) FILTER (WHERE estado = 'esperando_cliente') AS esperando_cliente,
      COUNT(*) FILTER (WHERE estado = 'esperando_devolucion') AS esperando_devolucion,
      COUNT(*) FILTER (WHERE prioridad = 'urgente' AND estado = ANY(${ESTADOS_ABIERTOS})) AS urgentes,
      COUNT(*) FILTER (WHERE sla_vencimiento IS NOT NULL AND sla_vencimiento < NOW() AND estado = ANY(${ESTADOS_ABIERTOS})) AS sla_vencidos
    FROM casos
    WHERE store_id = ${storeId}
  ` as {
    total_abiertos: string; pendientes_supervision: string; en_gestion: string;
    esperando_cliente: string; esperando_devolucion: string; urgentes: string; sla_vencidos: string;
  }[];
  const r = rows[0];
  return {
    totalAbiertos: Number(r?.total_abiertos ?? 0),
    pendientesSupervision: Number(r?.pendientes_supervision ?? 0),
    enGestion: Number(r?.en_gestion ?? 0),
    esperandoCliente: Number(r?.esperando_cliente ?? 0),
    esperandoDevolucion: Number(r?.esperando_devolucion ?? 0),
    urgentes: Number(r?.urgentes ?? 0),
    slaVencidos: Number(r?.sla_vencidos ?? 0),
  };
}

// ─── Lectura: detalle ─────────────────────────────────────────────────────────

export async function getTicketById(storeId: string, id: number): Promise<TicketDetalle | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM casos WHERE store_id = ${storeId} AND id = ${id}` as Ticket[];
  const ticket = rows[0];
  if (!ticket) return null;

  const [acciones, costos, adjuntos, comentarios, historial] = await Promise.all([
    sql`SELECT * FROM caso_acciones WHERE caso_id = ${id} ORDER BY created_at DESC`,
    sql`SELECT * FROM caso_costos WHERE caso_id = ${id} ORDER BY created_at DESC`,
    sql`SELECT * FROM caso_adjuntos WHERE caso_id = ${id} ORDER BY created_at DESC`,
    sql`SELECT * FROM caso_comentarios WHERE caso_id = ${id} ORDER BY created_at DESC`,
    sql`SELECT * FROM caso_historial WHERE caso_id = ${id} ORDER BY created_at DESC`,
  ]) as [TicketAccion[], TicketCosto[], TicketAdjunto[], TicketComentario[], TicketHistorialEntry[]];

  const costoTotal = costos.reduce((sum, c) => sum + Number(c.monto), 0);

  return { ...ticket, acciones, costos, costoTotal, adjuntos, comentarios, historial };
}

// Tickets cuyo pedido original coincide con este número — usado por
// /api/tracking para vincular un tracking de Andreani a un ticket cuando el
// número de la etiqueta no es un CAMBIO-{id} pero tampoco es un pedido real
// reconocido por Tienda Nube (ej. se cargó a mano en Andreani con el número
// real del pedido).
export async function getTicketsByNumeroPedido(storeId: string, numeroPedido: string): Promise<{ id: number }[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id FROM casos WHERE store_id = ${storeId} AND numero_pedido = ${numeroPedido}
  ` as { id: number }[];
  return rows;
}

// Actualiza el tracking del pedido original de un ticket (no del envío
// generado — eso vive en cambios.tracking, ver lib/cambiosDb.ts). Se usa
// cuando el número que Andreani imprimió coincide con el pedido real del
// ticket en vez de con un Cambio.
export async function setPedidoTracking(storeId: string, casoId: number, tracking: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE casos SET pedido_tracking = ${tracking}, updated_at = NOW() WHERE store_id = ${storeId} AND id = ${casoId}`;
}

// Otros tickets del mismo contacto (por teléfono/email/DNI), para el panel
// de historial de cliente. No es un JOIN contra un maestro de clientes —
// no existe uno — es una búsqueda por coincidencia de los campos denormalizados.
export async function getTicketsByContact(
  storeId: string,
  contacto: { telefono?: string | null; email?: string | null; dni?: string | null },
  excludeId: number,
): Promise<TicketResumenCliente[]> {
  const telefono = contacto.telefono || null;
  const email = contacto.email || null;
  const dni = contacto.dni || null;
  if (!telefono && !email && !dni) return [];

  const sql = getDb();
  const rows = await sql`
    SELECT id, numero_pedido, categoria, estado, created_at FROM casos
    WHERE store_id = ${storeId} AND id != ${excludeId}
      AND (
        (${telefono}::text IS NOT NULL AND cliente_telefono = ${telefono}) OR
        (${email}::text IS NOT NULL AND cliente_email = ${email}) OR
        (${dni}::text IS NOT NULL AND cliente_dni = ${dni})
      )
    ORDER BY created_at DESC
  ` as TicketResumenCliente[];
  return rows;
}

// Resumen de tipos de acción a través de varios tickets (usado por el
// panel de historial de cliente: cuántos cambios/reembolsos/devoluciones
// tuvo esa persona en total, sumando todos sus tickets).
export async function getAccionCountsForTickets(ticketIds: number[]): Promise<Record<string, number>> {
  if (!ticketIds.length) return {};
  const sql = getDb();
  const rows = await sql`
    SELECT tipo, COUNT(*) AS count FROM caso_acciones WHERE caso_id = ANY(${ticketIds}) GROUP BY tipo
  ` as { tipo: string; count: string }[];
  const result: Record<string, number> = {};
  for (const r of rows) result[r.tipo] = Number(r.count);
  return result;
}

// ─── Escritura: ticket ────────────────────────────────────────────────────────

export interface CreateTicketData {
  // Opcionales: "crear_orden_compra" no vincula un pedido real.
  canalPedido?: CanalPedido | null;
  numeroPedido?: string | null;
  pedidoIdInterno?: string | null;
  clienteNombre: string;
  clienteTelefono?: string | null;
  clienteEmail?: string | null;
  clienteInstagram?: string | null;
  clienteDni?: string | null;
  clienteDireccion?: string | null;
  pedidoTotal?: number | null;
  pedidoMoneda?: string | null;
  pedidoFecha?: string | null;
  pedidoEstado?: string | null;
  pedidoTransportista?: string | null;
  pedidoTracking?: string | null;
  pedidoProductos?: ProductoPedidoTicket[];
  categoria: string;
  subcategoria1?: string | null;
  subcategoria2?: string | null;
  canalContacto?: string | null;
  descripcion?: string | null;
  troubleshooting?: string | null;
  marca?: string | null;
  facturaDatos?: string | null;
  ordenCompraProductos?: string | null;
  prioridad?: string;
  createdBy: string;
}

export async function createTicket(storeId: string, data: CreateTicketData, slaVencimiento: Date): Promise<Ticket> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO casos (
      store_id, canal_pedido, numero_pedido, pedido_id_interno,
      cliente_nombre, cliente_telefono, cliente_email, cliente_instagram, cliente_dni, cliente_direccion,
      pedido_total, pedido_moneda, pedido_fecha, pedido_estado, pedido_transportista, pedido_tracking, pedido_productos_json,
      categoria, subcategoria_1, subcategoria_2, canal_contacto, descripcion, troubleshooting, marca,
      factura_datos, orden_compra_productos,
      prioridad, sla_vencimiento, created_by
    ) VALUES (
      ${storeId}, ${data.canalPedido ?? null}, ${data.numeroPedido ?? null}, ${data.pedidoIdInterno ?? null},
      ${data.clienteNombre}, ${data.clienteTelefono ?? null}, ${data.clienteEmail ?? null}, ${data.clienteInstagram ?? null}, ${data.clienteDni ?? null}, ${data.clienteDireccion ?? null},
      ${data.pedidoTotal ?? null}, ${data.pedidoMoneda ?? null}, ${data.pedidoFecha ?? null}, ${data.pedidoEstado ?? null}, ${data.pedidoTransportista ?? null}, ${data.pedidoTracking ?? null}, ${data.pedidoProductos ? JSON.stringify(data.pedidoProductos) : null},
      ${data.categoria}, ${data.subcategoria1 ?? null}, ${data.subcategoria2 ?? null}, ${data.canalContacto ?? null}, ${data.descripcion ?? null}, ${data.troubleshooting ?? null}, ${data.marca ?? null},
      ${data.facturaDatos ?? null}, ${data.ordenCompraProductos ?? null},
      ${data.prioridad ?? "normal"}, ${slaVencimiento.toISOString()}, ${data.createdBy}
    )
    RETURNING *
  ` as Ticket[];
  const ticket = rows[0];
  await addHistorial(
    ticket.id, "creacion",
    data.numeroPedido
      ? `Ticket creado por ${data.createdBy} a partir del pedido #${data.numeroPedido}`
      : `Ticket creado por ${data.createdBy} (carga manual, sin pedido vinculado)`,
    data.createdBy,
  );
  return ticket;
}

// Actualiza los campos editables del ticket. Cada grupo de campos que
// efectivamente cambia agrega su propia fila de historial (no una genérica),
// para que la timeline sea legible. `undefined` = no tocar ese campo.
export interface UpdateTicketData {
  estado?: EstadoTicket;
  prioridad?: string;
  responsableId?: string | null;
  responsableNombre?: string | null;
  categoria?: string;
  subcategoria1?: string | null;
  subcategoria2?: string | null;
  descripcion?: string | null;
  troubleshooting?: string | null;
  marca?: string | null;
  canalContacto?: string | null;
  valorComercial?: number | null;
  clienteNombre?: string;
  clienteTelefono?: string | null;
  clienteEmail?: string | null;
  clienteInstagram?: string | null;
  clienteDireccion?: string | null;
  facturaDatos?: string | null;
  facturaFormaPago?: string | null;
  ordenCompraProductos?: string | null;
}

export async function updateTicket(
  storeId: string, id: number, data: UpdateTicketData, updatedBy: string,
): Promise<Ticket | null> {
  const sql = getDb();
  const current = await getTicketById(storeId, id);
  if (!current) return null;

  const estado             = data.estado             ?? current.estado;
  const prioridad           = data.prioridad           ?? current.prioridad;
  const responsableId       = data.responsableId       !== undefined ? data.responsableId       : current.responsable_id;
  const responsableNombre   = data.responsableNombre   !== undefined ? data.responsableNombre   : current.responsable_nombre;
  const categoria           = data.categoria           ?? current.categoria;
  const subcategoria1       = data.subcategoria1       !== undefined ? data.subcategoria1       : current.subcategoria_1;
  const subcategoria2       = data.subcategoria2       !== undefined ? data.subcategoria2       : current.subcategoria_2;
  const descripcion         = data.descripcion         !== undefined ? data.descripcion         : current.descripcion;
  const troubleshooting     = data.troubleshooting     !== undefined ? data.troubleshooting     : current.troubleshooting;
  const marca               = data.marca               !== undefined ? data.marca               : current.marca;
  const canalContacto       = data.canalContacto       !== undefined ? data.canalContacto       : current.canal_contacto;
  const valorComercial      = data.valorComercial      !== undefined ? data.valorComercial      : current.valor_comercial;
  const clienteNombre       = data.clienteNombre       ?? current.cliente_nombre;
  const clienteTelefono     = data.clienteTelefono     !== undefined ? data.clienteTelefono     : current.cliente_telefono;
  const clienteEmail        = data.clienteEmail        !== undefined ? data.clienteEmail        : current.cliente_email;
  const clienteInstagram    = data.clienteInstagram    !== undefined ? data.clienteInstagram    : current.cliente_instagram;
  const clienteDireccion    = data.clienteDireccion    !== undefined ? data.clienteDireccion    : current.cliente_direccion;
  const facturaDatos        = data.facturaDatos        !== undefined ? data.facturaDatos        : current.factura_datos;
  const facturaFormaPago    = data.facturaFormaPago    !== undefined ? data.facturaFormaPago    : current.factura_forma_pago;
  const ordenCompraProductos = data.ordenCompraProductos !== undefined ? data.ordenCompraProductos : current.orden_compra_productos;

  const resueltoAt = estado === "resuelto" && current.estado !== "resuelto" ? new Date().toISOString() : current.resuelto_at;
  const cerradoAt  = estado === "cerrado"  && current.estado !== "cerrado"  ? new Date().toISOString() : current.cerrado_at;
  // SLA: si cambia la prioridad, se recalcula el vencimiento desde ahora.
  const slaVencimiento = data.prioridad && data.prioridad !== current.prioridad
    ? computeSlaVencimientoLocal(prioridad).toISOString()
    : current.sla_vencimiento;

  await sql`
    UPDATE casos SET
      estado = ${estado}, prioridad = ${prioridad},
      responsable_id = ${responsableId}, responsable_nombre = ${responsableNombre},
      categoria = ${categoria}, subcategoria_1 = ${subcategoria1}, subcategoria_2 = ${subcategoria2},
      descripcion = ${descripcion}, troubleshooting = ${troubleshooting}, marca = ${marca},
      canal_contacto = ${canalContacto}, valor_comercial = ${valorComercial},
      cliente_nombre = ${clienteNombre}, cliente_telefono = ${clienteTelefono}, cliente_email = ${clienteEmail},
      cliente_instagram = ${clienteInstagram}, cliente_direccion = ${clienteDireccion},
      factura_datos = ${facturaDatos}, factura_forma_pago = ${facturaFormaPago},
      orden_compra_productos = ${ordenCompraProductos},
      sla_vencimiento = ${slaVencimiento}, updated_at = NOW(),
      resuelto_at = ${resueltoAt}, cerrado_at = ${cerradoAt}
    WHERE store_id = ${storeId} AND id = ${id}
  `;

  if (data.estado && data.estado !== current.estado) {
    await addHistorial(id, "cambio_estado", `Cambió el estado de "${current.estado}" a "${data.estado}"`, updatedBy, { from: current.estado, to: data.estado });
  }
  if (data.responsableId !== undefined && data.responsableId !== current.responsable_id) {
    await addHistorial(id, "cambio_responsable", `Reasignó el ticket a ${responsableNombre || "sin asignar"}`, updatedBy, { from: current.responsable_id, to: responsableId });
  }
  if (
    (data.clienteTelefono !== undefined && data.clienteTelefono !== current.cliente_telefono) ||
    (data.clienteEmail !== undefined && data.clienteEmail !== current.cliente_email) ||
    (data.clienteInstagram !== undefined && data.clienteInstagram !== current.cliente_instagram) ||
    (data.clienteDireccion !== undefined && data.clienteDireccion !== current.cliente_direccion)
  ) {
    await addHistorial(id, "otro", `${updatedBy} actualizó los datos de contacto del cliente`, updatedBy);
  }

  const rows = await sql`SELECT * FROM casos WHERE store_id = ${storeId} AND id = ${id}` as Ticket[];
  return rows[0] ?? null;
}

// Copia local mínima de computeSlaVencimiento (lib/ticketSla.ts) para no
// crear una dependencia circular entre archivos de servidor y cliente;
// misma lógica, un solo lugar de verdad para las horas por prioridad.
function computeSlaVencimientoLocal(prioridad: string): Date {
  const horas = prioridad === "urgente" ? 2 : prioridad === "alta" ? 8 : 24;
  return new Date(Date.now() + horas * 60 * 60 * 1000);
}

// ─── Escritura: comentarios ────────────────────────────────────────────────────

export async function addComentario(casoId: number, texto: string, createdBy: string): Promise<TicketComentario> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO caso_comentarios (caso_id, texto, created_by)
    VALUES (${casoId}, ${texto}, ${createdBy})
    RETURNING *
  ` as TicketComentario[];
  await addHistorial(casoId, "comentario", `${createdBy} agregó un comentario interno`, createdBy);
  return rows[0];
}

// ─── Escritura: adjuntos ────────────────────────────────────────────────────────

export async function addAdjunto(
  casoId: number,
  data: { url: string; publicId: string | null; resourceType: string; nombreArchivo?: string | null; accionId?: number | null; cambioId?: number | null },
  createdBy: string,
): Promise<TicketAdjunto> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO caso_adjuntos (caso_id, accion_id, cambio_id, url, public_id, resource_type, nombre_archivo, created_by)
    VALUES (${casoId}, ${data.accionId ?? null}, ${data.cambioId ?? null}, ${data.url}, ${data.publicId}, ${data.resourceType}, ${data.nombreArchivo ?? null}, ${createdBy})
    RETURNING *
  ` as TicketAdjunto[];
  const label = data.cambioId ? `comprobante del envío #${data.cambioId}` : "un archivo";
  await addHistorial(casoId, "archivo", `${createdBy} adjuntó ${label}${data.nombreArchivo ? `: ${data.nombreArchivo}` : ""}`, createdBy);
  return rows[0];
}

export async function deleteAdjunto(casoId: number, adjuntoId: number, deletedBy: string): Promise<{ publicId: string | null; resourceType: string } | null> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM caso_adjuntos WHERE id = ${adjuntoId} AND caso_id = ${casoId}
    RETURNING public_id, resource_type
  ` as { public_id: string | null; resource_type: string }[];
  if (!rows.length) return null;
  await addHistorial(casoId, "archivo", `${deletedBy} eliminó un adjunto`, deletedBy);
  return { publicId: rows[0].public_id, resourceType: rows[0].resource_type };
}

// ─── Escritura: acciones ("Resolver ticket") ──────────────────────────────────

export async function addAccion(
  casoId: number,
  data: { tipo: TipoAccion; detalle?: string | null; monto?: number | null; referencia?: string | null },
  createdBy: string,
): Promise<TicketAccion> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO caso_acciones (caso_id, tipo, detalle, monto, referencia, created_by)
    VALUES (${casoId}, ${data.tipo}, ${data.detalle ?? null}, ${data.monto ?? null}, ${data.referencia ?? null}, ${createdBy})
    RETURNING *
  ` as TicketAccion[];
  await addHistorial(casoId, "accion", `${createdBy} registró la acción "${data.tipo}"`, createdBy, { tipo: data.tipo });
  return rows[0];
}

export async function updateAccion(
  casoId: number,
  accionId: number,
  data: { detalle?: string | null; monto?: number | null; referencia?: string | null },
  updatedBy: string,
): Promise<TicketAccion | null> {
  const sql = getDb();
  const current = await sql`SELECT * FROM caso_acciones WHERE id = ${accionId} AND caso_id = ${casoId}` as TicketAccion[];
  if (!current.length) return null;
  const actual = current[0];

  const detalle    = data.detalle    !== undefined ? data.detalle    : actual.detalle;
  const monto       = data.monto       !== undefined ? data.monto       : actual.monto;
  const referencia   = data.referencia   !== undefined ? data.referencia   : actual.referencia;

  const rows = await sql`
    UPDATE caso_acciones SET detalle = ${detalle}, monto = ${monto}, referencia = ${referencia}
    WHERE id = ${accionId} AND caso_id = ${casoId}
    RETURNING *
  ` as TicketAccion[];
  await addHistorial(casoId, "accion", `${updatedBy} editó la acción "${actual.tipo}"`, updatedBy, { tipo: actual.tipo });
  return rows[0] ?? null;
}

export async function deleteAccion(casoId: number, accionId: number, deletedBy: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM caso_acciones WHERE id = ${accionId} AND caso_id = ${casoId} RETURNING id, tipo
  ` as { id: number; tipo: string }[];
  if (!rows.length) return false;
  await addHistorial(casoId, "accion", `${deletedBy} eliminó la acción "${rows[0].tipo}"`, deletedBy);
  return true;
}

// ─── Escritura: costos ──────────────────────────────────────────────────────────

export async function addCosto(
  casoId: number,
  data: { tipo: TipoCosto; descripcion?: string | null; monto: number; sku?: string | null },
  createdBy: string,
): Promise<TicketCosto> {
  const sql = getDb();

  // Todo costo cargado en un ticket suma también a Gastos del negocio
  // (categoría "Envíos", igual que el resto de los costos logísticos) —
  // se crea el gasto primero para poder guardar su id en caso_costos.
  await initFinanzasTables();
  const detalleGasto = `Ticket #${casoId} — ${data.tipo.replace(/_/g, " ")}${data.descripcion ? `: ${data.descripcion}` : ""}`;
  const gasto = await createGastoNegocio({
    fecha: new Date().toISOString().slice(0, 10),
    persona: createdBy,
    categoria: "Envíos",
    detalle: detalleGasto,
    cantidad: 1,
    monto: data.monto,
    pagado: false,
  });

  const rows = await sql`
    INSERT INTO caso_costos (caso_id, tipo, descripcion, monto, sku, gasto_id, created_by)
    VALUES (${casoId}, ${data.tipo}, ${data.descripcion ?? null}, ${data.monto}, ${data.sku ?? null}, ${gasto.id}, ${createdBy})
    RETURNING *
  ` as TicketCosto[];
  await addHistorial(casoId, "costo", `${createdBy} agregó un costo de $${data.monto} (${data.tipo}) — sumado a Gastos del negocio`, createdBy);
  return rows[0];
}

// Borra un ticket completo (cascada: acciones, costos, adjuntos,
// comentarios, historial). Devuelve los public_id de Cloudinary de sus
// adjuntos para que el caller los purgue. Pensado para casos cargados por
// error/duplicados — el flujo normal es pasar el ticket a "cancelado", no
// borrarlo.
export async function deleteTicket(storeId: string, id: number): Promise<{ publicIds: string[] } | null> {
  const sql = getDb();
  const imagenes = await sql`SELECT public_id FROM caso_adjuntos WHERE caso_id = ${id}` as { public_id: string | null }[];
  const rows = await sql`DELETE FROM casos WHERE store_id = ${storeId} AND id = ${id} RETURNING id` as { id: number }[];
  if (!rows.length) return null;
  return { publicIds: imagenes.map(i => i.public_id).filter((pid): pid is string => !!pid) };
}

export async function deleteCosto(casoId: number, costoId: number, deletedBy: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM caso_costos WHERE id = ${costoId} AND caso_id = ${casoId} RETURNING id, gasto_id
  ` as { id: number; gasto_id: number | null }[];
  if (!rows.length) return false;
  if (rows[0].gasto_id) {
    await deleteGastoNegocio(rows[0].gasto_id);
  }
  await addHistorial(casoId, "costo", `${deletedBy} eliminó un costo (y su gasto en Finanzas)`, deletedBy);
  return true;
}
