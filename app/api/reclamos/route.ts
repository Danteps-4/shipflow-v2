import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initReclamosTables, getReclamos, updateReclamoEstado, moveReclamoToLista, updateReclamoCampos, deleteReclamo, ESTADOS_RECLAMO } from "@/lib/reclamosDb";
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
  const guard = await requireModule(req, "reclamos", "/reclamos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initReclamosTables();
  const reclamos = await getReclamos(storeId);
  return NextResponse.json({ reclamos });
}

// Body: { id, estado, resolucion? } mueve entre columnas fijas;
// { id, listaId } mueve a una lista personalizada;
// { id, telefono?, plataforma?, tracking?, notas?, asignadoA? } actualiza
// los campos "vivos" del caso (los que no piden pasar por Resolver).
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "reclamos", "/reclamos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initReclamosTables();

  if (typeof body.listaId !== "undefined") {
    const reclamo = await moveReclamoToLista(storeId, Number(id), Number(body.listaId));
    if (!reclamo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ reclamo });
  }

  if (typeof body.estado === "undefined") {
    const reclamo = await updateReclamoCampos(storeId, Number(id), {
      telefono: body.telefono,
      plataforma: body.plataforma,
      tracking: body.tracking,
      notas: body.notas,
      asignadoA: body.asignadoA,
    });
    if (!reclamo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ reclamo });
  }

  const { estado, resolucion } = body;
  if (!ESTADOS_RECLAMO.includes(estado)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const reclamo = await updateReclamoEstado(storeId, Number(id), estado, { resolucion, resolvedBy: guard.user.name });
  if (!reclamo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ reclamo });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "reclamos", "/reclamos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initReclamosTables();
  const borrado = await deleteReclamo(storeId, Number(id));
  if (!borrado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await Promise.all(borrado.publicIds.map((publicId) => destroyAsset(publicId, "image").catch(() => {})));
  return NextResponse.json({ ok: true });
}
