import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule, requireTicketsSupervisor } from "@/lib/permissions";
import { addHistorial } from "@/lib/ticketsDb";
import { initCambiosTables, getCambioById, updateCambio, deleteCambio, TipoCambio } from "@/lib/cambiosDb";
import { initPedidoExtrasTables, setExtraDeCambio, ensureExtraSkuUnico } from "@/lib/pedidoExtrasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

interface DestinoBody {
  cambioId?: number;
  tipo?: TipoCambio;
  direccion?: string; numeroDireccion?: string; piso?: string; localidad?: string;
  provincia?: string; codigoPostal?: string; sucursal?: string;
  sku?: string | null;
}

function validarDestino(body: DestinoBody): string | null {
  if (body.tipo !== "domicilio" && body.tipo !== "sucursal") return "Tipo inválido";
  if (body.tipo === "sucursal" && !body.sucursal?.trim()) return "Falta la sucursal";
  if (body.tipo === "domicilio" && (!body.direccion?.trim() || !body.numeroDireccion?.trim())) return "Falta calle y número";
  return null;
}

// Edita el destino (domicilio/sucursal) de un Cambio ya generado desde este
// ticket — mismo Cambio, no crea uno nuevo. Gateado solo por módulo: es
// corregir un dato, no borrar nada.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const casoId = Number(params.id);
  const body = await req.json() as DestinoBody;
  if (!body.cambioId) return NextResponse.json({ error: "Falta cambioId" }, { status: 400 });
  const error = validarDestino(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await initCambiosTables();
  const actual = await getCambioById(storeId, body.cambioId);
  if (!actual || actual.ticket_caso_id !== casoId) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const cambio = await updateCambio(storeId, body.cambioId, {
    nombre: actual.nombre, telefono: actual.telefono, email: actual.email ?? undefined, dni: actual.dni ?? undefined,
    motivo: actual.motivo ?? undefined, numeroPedidoOriginal: actual.numero_pedido_original ?? undefined,
    tipo: body.tipo!,
    direccion: body.direccion, numeroDireccion: body.numeroDireccion, piso: body.piso,
    localidad: body.localidad, provincia: body.provincia, codigoPostal: body.codigoPostal, sucursal: body.sucursal,
    sku: body.sku !== undefined ? (body.sku?.trim() || null) : undefined,
  });
  await addHistorial(
    casoId, "otro",
    `${guard.user.name} editó el destino del envío generado (Cambio #${body.cambioId}, ${body.tipo === "sucursal" ? "a sucursal" : "a domicilio"})`,
    guard.user.name, { cambioId: body.cambioId, tipo: body.tipo },
  );

  if (cambio) {
    await initPedidoExtrasTables();
    const notaExtra = cambio.motivo ?? `Ticket #${casoId}`;
    await setExtraDeCambio(storeId, cambio.id, cambio.sku, notaExtra);
    if (cambio.sku && cambio.numero_pedido_original) {
      await ensureExtraSkuUnico(storeId, cambio.numero_pedido_original, cambio.sku, notaExtra);
    }
  }
  return NextResponse.json({ cambio });
}

// Borra un Cambio generado desde este ticket — reservado a supervisión,
// mismo criterio que borrar un costo o una acción.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTicketsSupervisor(req);
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const casoId = Number(params.id);
  const { cambioId } = await req.json() as { cambioId?: number };
  if (!cambioId) return NextResponse.json({ error: "Falta cambioId" }, { status: 400 });

  await initCambiosTables();
  const actual = await getCambioById(storeId, cambioId);
  if (!actual || actual.ticket_caso_id !== casoId) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await deleteCambio(storeId, cambioId);
  await initPedidoExtrasTables();
  await setExtraDeCambio(storeId, cambioId, null, "");
  await addHistorial(casoId, "otro", `${guard.user.name} eliminó el envío generado (Cambio #${cambioId})`, guard.user.name);
  return NextResponse.json({ ok: true });
}
