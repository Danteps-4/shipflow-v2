import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initSoporteTables, getTicketById, marcarTicketConvertido } from "@/lib/soporteDb";
import { initReclamosTables, createReclamo } from "@/lib/reclamosDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

// Se gatea por el módulo "soporte" (no "reclamos"): quien convierte una
// tarjeta es la persona de atención al cliente que carga los tickets, no
// necesariamente quien después gestiona los reclamos.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "soporte", "/soporte");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { ticketId } = await req.json();
  if (!ticketId) return NextResponse.json({ error: "Falta ticketId" }, { status: 400 });

  await initSoporteTables();
  const ticket = await getTicketById(storeId, Number(ticketId));
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  if (ticket.convertido_a_reclamo_id) {
    return NextResponse.json({ error: "Este ticket ya fue convertido a reclamo" }, { status: 400 });
  }

  await initReclamosTables();
  const reclamo = await createReclamo(storeId, {
    titulo: ticket.titulo,
    descripcion: ticket.descripcion,
    categoria: ticket.categoria,
    plataforma: ticket.plataforma,
    telefono: ticket.telefono,
    createdBy: guard.user.name,
    ticketOrigenId: ticket.id,
    imagenes: ticket.imagenes.map((img) => ({ url: img.url, publicId: img.public_id })),
  });

  await marcarTicketConvertido(storeId, ticket.id, reclamo.id);

  return NextResponse.json({ reclamo });
}
