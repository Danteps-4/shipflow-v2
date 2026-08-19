import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initSoporteTables, getTickets, createTicket, updateTicketEstado, moveTicketToLista, updateTicketCampos, deleteTicket, ESTADOS_TICKET } from "@/lib/soporteDb";
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

  const { titulo, descripcion, categoria, telefono, email, instagram, plataforma, imagenes } = await req.json();
  if (!titulo) return NextResponse.json({ error: "Falta el título" }, { status: 400 });

  await initSoporteTables();
  const ticket = await createTicket(storeId, {
    titulo,
    descripcion: descripcion || null,
    categoria: categoria || "Otro",
    createdBy: guard.user.name,
    telefono: telefono || null,
    email: email || null,
    instagram: instagram || null,
    plataforma: plataforma || null,
    imagenes: Array.isArray(imagenes) ? imagenes : [],
  });
  return NextResponse.json({ ticket });
}

// Body: { id, estado, resolucion? } mueve entre columnas fijas;
// { id, listaId } mueve a una lista personalizada;
// { id, telefono?, email?, instagram?, plataforma?, tracking?, notas?, asignadoA? }
// actualiza los campos "vivos" del caso (los que no piden pasar por Resolver).
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "soporte", "/soporte");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initSoporteTables();

  if (typeof body.listaId !== "undefined") {
    const ticket = await moveTicketToLista(storeId, Number(id), Number(body.listaId));
    if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ticket });
  }

  if (typeof body.estado === "undefined") {
    const ticket = await updateTicketCampos(storeId, Number(id), {
      telefono: body.telefono,
      email: body.email,
      instagram: body.instagram,
      plataforma: body.plataforma,
      tracking: body.tracking,
      notas: body.notas,
      asignadoA: body.asignadoA,
    });
    if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ticket });
  }

  const { estado, resolucion } = body;
  if (!ESTADOS_TICKET.includes(estado)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
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
