import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initSoporteTables, getTickets, createTicket, updateTicketEstado, deleteTicket, ESTADOS_TICKET } from "@/lib/soporteDb";
import { destroyAsset } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "soporte", "/soporte");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initSoporteTables();
  const tickets = await getTickets(storeId);
  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "soporte", "/soporte");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { titulo, descripcion, categoria, imagenes } = await req.json();
  if (!titulo) return NextResponse.json({ error: "Falta el título" }, { status: 400 });

  await initSoporteTables();
  const ticket = await createTicket(storeId, {
    titulo,
    descripcion: descripcion || null,
    categoria: categoria || "Otro",
    createdBy: guard.user.name,
    imagenes: Array.isArray(imagenes) ? imagenes : [],
  });
  return NextResponse.json({ ticket });
}

// Body: { id, estado, resolucion? } — mueve la tarjeta entre columnas.
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "soporte", "/soporte");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id, estado, resolucion } = await req.json();
  if (!id || !ESTADOS_TICKET.includes(estado)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  await initSoporteTables();
  const ticket = await updateTicketEstado(storeId, Number(id), estado, { resolucion, resolvedBy: guard.user.name });
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ticket });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "soporte", "/soporte");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initSoporteTables();
  const borrado = await deleteTicket(storeId, Number(id));
  if (!borrado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await Promise.all(borrado.publicIds.map((publicId) => destroyAsset(publicId, "image").catch(() => {})));
  return NextResponse.json({ ok: true });
}
