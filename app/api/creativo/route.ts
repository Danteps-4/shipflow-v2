import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initCreativoTables, getCreativos, createCreativo, deleteCreativo, updateCreativoMeta, updateCreativoContenido, TipoCreativo, NuevoArchivo, WinnerOverride } from "@/lib/creativoDb";
import { destroyAsset } from "@/lib/cloudinary";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

const TIPOS_VALIDOS: TipoCreativo[] = ["angulo", "guion", "formato", "anuncio", "referencia"];
const OVERRIDES_VALIDOS: WinnerOverride[] = ["winner", "regular", "malo"];

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "creativo", "/creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tipoParam = req.nextUrl.searchParams.get("tipo");
  const tipo = tipoParam && TIPOS_VALIDOS.includes(tipoParam as TipoCreativo) ? (tipoParam as TipoCreativo) : undefined;
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;

  await initCreativoTables();
  const creativos = await getCreativos(storeId, { tipo, tag });
  return NextResponse.json({ creativos });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "creativo", "/creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { tipo, titulo, contenido, tags, archivos } = await req.json() as {
    tipo?: string; titulo?: string; contenido?: string; tags?: string[]; archivos?: NuevoArchivo[];
  };

  if (!tipo || !TIPOS_VALIDOS.includes(tipo as TipoCreativo) || !titulo?.trim()) {
    return NextResponse.json({ error: "Faltan campos: tipo, titulo" }, { status: 400 });
  }

  await initCreativoTables();
  const creativo = await createCreativo(storeId, {
    tipo: tipo as TipoCreativo,
    titulo: titulo.trim(),
    contenido: (contenido ?? "").trim(),
    tags: (tags ?? []).map(t => t.trim()).filter(Boolean),
    createdBy: guard.user.name,
    archivos: archivos ?? [],
  });
  return NextResponse.json({ creativo });
}

// Body: { id, titulo, contenido, tags } edita el contenido de una entrada
// (ej. corregir la nota de un ejemplo de referencia);
// { id, metaAdId, winnerOverride } vincula/desvincula un anuncio de Meta
// y/o fija el override manual de winner/regular/malo (metaAdId/
// winnerOverride pueden venir en null para desvincular/volver a auto).
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "creativo", "/creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as {
    id?: number; titulo?: string; contenido?: string; tags?: string[]; archivos?: NuevoArchivo[];
    metaAdId?: string | null; winnerOverride?: WinnerOverride | null;
  };
  if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initCreativoTables();

  if (typeof body.titulo === "string") {
    if (!body.titulo.trim()) return NextResponse.json({ error: "Falta título" }, { status: 400 });
    const creativo = await updateCreativoContenido(storeId, Number(body.id), {
      titulo: body.titulo.trim(),
      contenido: (body.contenido ?? "").trim(),
      tags: (body.tags ?? []).map(t => t.trim()).filter(Boolean),
      archivosNuevos: body.archivos ?? [],
    });
    if (!creativo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ creativo });
  }

  if (body.winnerOverride != null && !OVERRIDES_VALIDOS.includes(body.winnerOverride)) {
    return NextResponse.json({ error: "winnerOverride inválido" }, { status: 400 });
  }

  const creativo = await updateCreativoMeta(storeId, Number(body.id), body.metaAdId ?? null, body.winnerOverride ?? null);
  if (!creativo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ creativo });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "creativo", "/creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initCreativoTables();
  const archivosBorrados = await deleteCreativo(storeId, Number(id));

  await Promise.all(
    archivosBorrados.map(a => destroyAsset(a.public_id, a.tipo_archivo).catch(() => {})),
  );

  return NextResponse.json({ ok: true });
}
