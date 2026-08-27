import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initTicketsTables, getTickets, createTicket, addAdjunto, CreateTicketData } from "@/lib/ticketsDb";
import { computeSlaVencimiento } from "@/lib/ticketSla";
import { normalizeCuit } from "@/lib/normalizers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  await initTicketsTables();
  const tickets = await getTickets(storeId, {
    q: sp.get("q") ?? undefined,
    estado: sp.get("estado") ?? undefined,
    categoria: sp.get("categoria") ?? undefined,
    canalContacto: sp.get("canal") ?? undefined,
    prioridad: sp.get("prioridad") ?? undefined,
    responsableId: sp.get("responsable") ?? undefined,
    marca: sp.get("marca") ?? undefined,
    producto: sp.get("producto") ?? undefined,
    fechaDesde: sp.get("fecha_desde") ?? undefined,
    fechaHasta: sp.get("fecha_hasta") ?? undefined,
  });
  return NextResponse.json({ tickets });
}

interface CreateTicketBody {
  canalPedido?: string | null;
  numeroPedido?: string | null;
  pedidoIdInterno?: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  clienteInstagram?: string;
  clienteDni?: string;
  clienteDireccion?: string;
  pedidoTotal?: number;
  pedidoMoneda?: string;
  pedidoFecha?: string;
  pedidoEstado?: string;
  pedidoTransportista?: string;
  pedidoTracking?: string;
  pedidoProductos?: CreateTicketData["pedidoProductos"];
  categoria?: string;
  subcategoria1?: string;
  subcategoria2?: string;
  canalContacto?: string;
  descripcion?: string;
  troubleshooting?: string;
  marca?: string;
  facturaCuit?: string;
  facturaRazonSocial?: string;
  facturaCondicionIva?: string;
  facturaDireccionFiscal?: string;
  prioridad?: string;
  adjuntos?: { url: string; publicId?: string | null; resourceType?: string; nombreArchivo?: string | null }[];
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as CreateTicketBody;
  if (!body.categoria) return NextResponse.json({ error: "Falta la categoría" }, { status: 400 });

  // "crear_orden_compra" es la única categoría sin pedido vinculado — por
  // definición, el pedido todavía no existe en Tienda Nube/Mercado Libre.
  // El resto sigue requiriendo un pedido real, igual que siempre.
  if (body.categoria === "crear_orden_compra") {
    if (!body.clienteNombre?.trim()) return NextResponse.json({ error: "Falta el nombre del cliente" }, { status: 400 });
  } else {
    if (!body.canalPedido || (body.canalPedido !== "tiendanube" && body.canalPedido !== "mercadolibre")) {
      return NextResponse.json({ error: "Falta el canal del pedido" }, { status: 400 });
    }
    if (!body.numeroPedido) return NextResponse.json({ error: "Falta el pedido" }, { status: 400 });
  }

  await initTicketsTables();
  const prioridad = body.prioridad || "normal";
  const ticket = await createTicket(storeId, {
    canalPedido: (body.canalPedido as CreateTicketData["canalPedido"]) ?? null,
    numeroPedido: body.numeroPedido ?? null,
    pedidoIdInterno: body.pedidoIdInterno,
    clienteNombre: body.clienteNombre || "",
    clienteTelefono: body.clienteTelefono,
    clienteEmail: body.clienteEmail,
    clienteInstagram: body.clienteInstagram,
    clienteDni: body.clienteDni,
    clienteDireccion: body.clienteDireccion,
    pedidoTotal: body.pedidoTotal,
    pedidoMoneda: body.pedidoMoneda,
    pedidoFecha: body.pedidoFecha,
    pedidoEstado: body.pedidoEstado,
    pedidoTransportista: body.pedidoTransportista,
    pedidoTracking: body.pedidoTracking,
    pedidoProductos: body.pedidoProductos,
    categoria: body.categoria,
    subcategoria1: body.subcategoria1,
    subcategoria2: body.subcategoria2,
    canalContacto: body.canalContacto,
    descripcion: body.descripcion,
    troubleshooting: body.troubleshooting,
    marca: body.marca,
    facturaCuit: body.facturaCuit ? normalizeCuit(body.facturaCuit) : null,
    facturaRazonSocial: body.facturaRazonSocial || null,
    facturaCondicionIva: body.facturaCondicionIva || null,
    facturaDireccionFiscal: body.facturaDireccionFiscal || null,
    prioridad,
    createdBy: guard.user.name,
  }, computeSlaVencimiento(prioridad));

  for (const adj of body.adjuntos ?? []) {
    await addAdjunto(ticket.id, {
      url: adj.url, publicId: adj.publicId ?? null, resourceType: adj.resourceType ?? "image", nombreArchivo: adj.nombreArchivo,
    }, guard.user.name);
  }

  return NextResponse.json({ ticket });
}
