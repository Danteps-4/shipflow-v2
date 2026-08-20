import { NextRequest, NextResponse } from "next/server";
import { requireModule, requireTicketsSupervisor } from "@/lib/permissions";
import { initTicketsTables, addAdjunto, deleteAdjunto } from "@/lib/ticketsDb";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { getCambioById } from "@/lib/cambiosDb";
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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const body = await req.json() as { url?: string; publicId?: string | null; resourceType?: string; nombreArchivo?: string | null; accionId?: number | null; cambioId?: number | null };
  if (!body.url) return NextResponse.json({ error: "Falta la url" }, { status: 400 });

  const casoId = Number(params.id);

  if (body.cambioId) {
    const storeId = await getStoreId(req);
    if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const cambio = await getCambioById(storeId, body.cambioId);
    if (!cambio || cambio.ticket_caso_id !== casoId) return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
  }

  await initTicketsTables();
  const adjunto = await addAdjunto(casoId, {
    url: body.url,
    publicId: body.publicId ?? null,
    resourceType: body.resourceType ?? "image",
    nombreArchivo: body.nombreArchivo,
    accionId: body.accionId,
    cambioId: body.cambioId,
  }, guard.user.name);
  return NextResponse.json({ adjunto });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTicketsSupervisor(req);
  if (!guard.ok) return guard.response;

  const { adjuntoId } = await req.json() as { adjuntoId?: number };
  if (!adjuntoId) return NextResponse.json({ error: "Falta adjuntoId" }, { status: 400 });

  await initTicketsTables();
  const borrado = await deleteAdjunto(Number(params.id), adjuntoId, guard.user.name);
  if (!borrado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (borrado.publicId) {
    const resourceType = borrado.resourceType === "video" || borrado.resourceType === "raw" ? borrado.resourceType : "image";
    await destroyAsset(borrado.publicId, resourceType).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
