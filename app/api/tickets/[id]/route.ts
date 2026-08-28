import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule, requireTicketsSupervisor } from "@/lib/permissions";
import { initTicketsTables, getTicketById, getTicketsByContact, getAccionCountsForTickets, updateTicket, deleteTicket, ESTADOS_TICKET, UpdateTicketData } from "@/lib/ticketsDb";
import { initCambiosTables, getCambiosByTicketCasoId } from "@/lib/cambiosDb";
import { initPedidoEnvioTables, getEnvioOverridesPorOrdenes } from "@/lib/pedidoEnvioDb";
import { destroyAsset } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initTicketsTables();
  const ticket = await getTicketById(storeId, Number(params.id));
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const otrosTickets = await getTicketsByContact(storeId, {
    telefono: ticket.cliente_telefono, email: ticket.cliente_email, dni: ticket.cliente_dni,
  }, ticket.id);
  const accionesResumen = await getAccionCountsForTickets([ticket.id, ...otrosTickets.map(t => t.id)]);

  await initCambiosTables();
  const cambiosGenerados = await getCambiosByTicketCasoId(storeId, ticket.id);

  let envioOverride = null;
  if (ticket.canal_pedido === "tiendanube" && ticket.numero_pedido) {
    await initPedidoEnvioTables();
    const overrides = await getEnvioOverridesPorOrdenes(storeId, [ticket.numero_pedido]);
    envioOverride = overrides[ticket.numero_pedido] ?? null;
  }

  return NextResponse.json({ ticket, otrosTickets, accionesResumen, cambiosGenerados, envioOverride });
}

interface PatchBody {
  estado?: string;
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
  cambioDireccionNueva?: string | null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const id = Number(params.id);
  const body = await req.json() as PatchBody;

  const actual = await getTicketById(storeId, id);
  if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Requieren supervisión: salir de "pendiente_supervision", pasar a
  // "cerrado", o reasignar el ticket a otra persona que no sea uno mismo.
  const saliendoDePendienteSupervision = actual.estado === "pendiente_supervision" && body.estado && body.estado !== "pendiente_supervision";
  const pasandoACerrado = body.estado === "cerrado" && actual.estado !== "cerrado";
  const reasignandoAOtro = body.responsableId !== undefined && body.responsableId !== actual.responsable_id && body.responsableId !== guard.user.id;

  if (saliendoDePendienteSupervision || pasandoACerrado || reasignandoAOtro) {
    const supGuard = await requireTicketsSupervisor(req);
    if (!supGuard.ok) return supGuard.response;
  }

  if (body.estado && !ESTADOS_TICKET.includes(body.estado as typeof ESTADOS_TICKET[number])) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  await initTicketsTables();
  const data: UpdateTicketData = {
    estado: body.estado as UpdateTicketData["estado"],
    prioridad: body.prioridad,
    responsableId: body.responsableId,
    responsableNombre: body.responsableNombre,
    categoria: body.categoria,
    subcategoria1: body.subcategoria1,
    subcategoria2: body.subcategoria2,
    descripcion: body.descripcion,
    troubleshooting: body.troubleshooting,
    marca: body.marca,
    canalContacto: body.canalContacto,
    valorComercial: body.valorComercial,
    clienteNombre: body.clienteNombre,
    clienteTelefono: body.clienteTelefono,
    clienteEmail: body.clienteEmail,
    clienteInstagram: body.clienteInstagram,
    clienteDireccion: body.clienteDireccion,
    facturaDatos: body.facturaDatos,
    facturaFormaPago: body.facturaFormaPago,
    ordenCompraProductos: body.ordenCompraProductos,
    cambioDireccionNueva: body.cambioDireccionNueva,
  };
  const ticket = await updateTicket(storeId, id, data, guard.user.name);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ticket });
}

// Borrado completo del ticket — reservado a supervisión (el flujo normal
// para un caso terminado es pasarlo a "cancelado", no borrarlo).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTicketsSupervisor(req);
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initTicketsTables();
  const borrado = await deleteTicket(storeId, Number(params.id));
  if (!borrado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await Promise.all(borrado.publicIds.map(publicId => destroyAsset(publicId, "image").catch(() => {})));
  return NextResponse.json({ ok: true });
}
