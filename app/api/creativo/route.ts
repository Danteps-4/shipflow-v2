import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initCreativoTables, getCreativos, createCreativo, deleteCreativo, updateCreativoMeta, TipoCreativo, NuevoArchivo, WinnerOverride } from "@/lib/creativoDb";
import { destroyAsset } from "@/lib/cloudinary";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

const TIPOS_VALIDOS: TipoCreativo[] = ["angulo", "guion", "formato", "anuncio"];
const OVERRIDES_VALIDOS: WinnerOverride[] = ["winner", "regular", "malo"];

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
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
  const guard = await requireModule(req, "creativo");
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

// Vincula/desvincula un anuncio de Meta a un creativo y/o fija su override
// manual de winner/regular/malo. Body: { id, metaAdId, winnerOverride }
// (metaAdId/winnerOverride pueden venir en null para desvincular/volver a auto).
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id, metaAdId, winnerOverride } = await req.json() as {
    id?: number; metaAdId?: string | null; winnerOverride?: WinnerOverride | null;
  };
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (winnerOverride != null && !OVERRIDES_VALIDOS.includes(winnerOverride)) {
    return NextResponse.json({ error: "winnerOverride inválido" }, { status: 400 });
  }

  await initCreativoTables();
  const creativo = await updateCreativoMeta(storeId, Number(id), metaAdId ?? null, winnerOverride ?? null);
  if (!creativo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ creativo });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
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
