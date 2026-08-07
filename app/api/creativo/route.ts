import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { hasLinkAccess, hasLinkAction, LinkAction } from "@/lib/navGroups";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initCreativoTables, getCreativos, createCreativo, deleteCreativo, updateCreativoMeta, updateCreativoContenido, incrementarContadorObjecion, getCreativoTipo, getCreativoById, TipoCreativo, NuevoArchivo, WinnerOverride, EtapaGuion, EstadoAngulo } from "@/lib/creativoDb";
import { destroyAsset } from "@/lib/cloudinary";
import { User } from "@/lib/userStore";

// El módulo "creativo" alcanza con estar habilitado, pero cada tab (ángulos,
// referencias, marcas, publicidad, etc.) es su propio sub apartado — ver
// lib/navGroups.ts. Devuelve la respuesta de error si no tiene acceso a ese tab.
function checkTabAccess(user: User, tipo: TipoCreativo) {
  if (user.role === "admin") return null;
  if (!hasLinkAccess(user.linkAccess, `/creativo?tab=${tipo}`)) {
    return NextResponse.json({ error: "No tenés acceso a esta sección" }, { status: 403 });
  }
  return null;
}

// Además de poder ver el tab, cada sub apartado admite restringir
// agregar/editar/eliminar por separado (ej. el editor de video puede subir
// pero no borrar ni editar lo que subió el guionista). Sin restricción
// explícita para ese tab, la acción está permitida.
function checkAccionAccess(user: User, tipo: TipoCreativo, accion: LinkAction) {
  if (user.role === "admin") return null;
  if (!hasLinkAction(user.linkActions, `/creativo?tab=${tipo}`, accion)) {
    return NextResponse.json({ error: "No tenés permiso para esta acción" }, { status: 403 });
  }
  return null;
}

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

const TIPOS_VALIDOS: TipoCreativo[] = ["angulo", "guion", "formato", "anuncio", "referencia", "renovacion", "marca", "analisis", "objecion"];

// Campos propios del análisis de renovación (tipo "analisis"); en el resto
// de los tipos vienen undefined y quedan null/vacío en la base. La
// estructura del guion es una lista libre de etapas (sin fijas): el
// usuario la arma a medida que desglosa el guion real de la renovación.
interface CamposAnalisis {
  angulo?: string; formato?: string; estructura?: EtapaGuion[]; hipotesis?: string;
}

function sanitizeAnalisis(body: CamposAnalisis): CamposAnalisis {
  return {
    angulo: body.angulo?.trim(), formato: body.formato?.trim(), hipotesis: body.hipotesis?.trim(),
    estructura: (body.estructura ?? [])
      .map(e => ({ titulo: (e.titulo ?? "").trim(), texto: (e.texto ?? "").trim() }))
      .filter(e => e.titulo || e.texto),
  };
}
// Campos propios del ángulo (tipo "angulo"): si ya se probó y funcionó o
// no, y si (más allá de ese estado) necesita una landing page propia.
interface CamposAngulo {
  estadoAngulo?: string | null; necesitaLanding?: boolean;
}

const ESTADOS_ANGULO_VALIDOS: EstadoAngulo[] = ["sin_probar", "validado", "no_funciono"];

function sanitizeAngulo(body: CamposAngulo): { estadoAngulo: EstadoAngulo | null; necesitaLanding: boolean } {
  const estado = body.estadoAngulo;
  return {
    estadoAngulo: estado && ESTADOS_ANGULO_VALIDOS.includes(estado as EstadoAngulo) ? (estado as EstadoAngulo) : null,
    necesitaLanding: !!body.necesitaLanding,
  };
}

const OVERRIDES_VALIDOS: WinnerOverride[] = ["winner", "regular", "malo"];
const FUNNEL_VALIDOS = ["TOF", "MOF", "BOF"];

function sanitizeFunnel(funnel?: string[]): string[] {
  return Array.from(new Set((funnel ?? []).map(f => f.trim().toUpperCase()).filter(f => FUNNEL_VALIDOS.includes(f))));
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tipoParam = req.nextUrl.searchParams.get("tipo");
  const tipo = tipoParam && TIPOS_VALIDOS.includes(tipoParam as TipoCreativo) ? (tipoParam as TipoCreativo) : undefined;
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;

  if (guard.user.role !== "admin") {
    if (!tipo) return NextResponse.json({ error: "Falta tipo" }, { status: 400 });
    const denied = checkTabAccess(guard.user, tipo);
    if (denied) return denied;
  }

  await initCreativoTables();
  const creativos = await getCreativos(storeId, { tipo, tag });
  return NextResponse.json({ creativos });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { tipo, titulo, contenido, tags, archivos, links, funnel, ...camposExtra } = await req.json() as {
    tipo?: string; titulo?: string; contenido?: string; tags?: string[]; archivos?: NuevoArchivo[];
    links?: string[]; funnel?: string[];
  } & CamposAnalisis & CamposAngulo;

  if (!tipo || !TIPOS_VALIDOS.includes(tipo as TipoCreativo) || !titulo?.trim()) {
    return NextResponse.json({ error: "Faltan campos: tipo, titulo" }, { status: 400 });
  }

  const denied = checkTabAccess(guard.user, tipo as TipoCreativo);
  if (denied) return denied;
  const deniedAccion = checkAccionAccess(guard.user, tipo as TipoCreativo, "agregar");
  if (deniedAccion) return deniedAccion;

  await initCreativoTables();
  const creativo = await createCreativo(storeId, {
    tipo: tipo as TipoCreativo,
    titulo: titulo.trim(),
    contenido: (contenido ?? "").trim(),
    tags: (tags ?? []).map(t => t.trim()).filter(Boolean),
    createdBy: guard.user.name,
    archivos: archivos ?? [],
    links: (links ?? []).map(l => l.trim()).filter(Boolean),
    funnel: sanitizeFunnel(funnel),
    ...sanitizeAnalisis(camposExtra),
    ...sanitizeAngulo(camposExtra),
  });
  return NextResponse.json({ creativo });
}

// Body: { id, titulo, contenido, tags, links?, archivos? } edita el
// contenido de una entrada (ej. corregir la nota de un ejemplo de
// referencia, agregar links o sumar más archivos);
// { id, metaAdId, winnerOverride } vincula/desvincula un anuncio de Meta
// y/o fija el override manual de winner/regular/malo (metaAdId/
// winnerOverride pueden venir en null para desvincular/volver a auto).
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as {
    id?: number; titulo?: string; contenido?: string; tags?: string[]; links?: string[]; funnel?: string[];
    archivos?: NuevoArchivo[]; metaAdId?: string | null; winnerOverride?: WinnerOverride | null;
    incrementar?: boolean;
  } & CamposAnalisis & CamposAngulo;
  if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initCreativoTables();

  // Sumar 1 al contador de una pregunta/objeción repetida (tipo "objecion")
  // no es una edición de contenido, es más parecido a "agregar" un nuevo
  // registro de que volvió a pasar.
  if (body.incrementar === true) {
    if (guard.user.role !== "admin") {
      const itemTipo = await getCreativoTipo(storeId, Number(body.id));
      if (!itemTipo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      const denied = checkTabAccess(guard.user, itemTipo);
      if (denied) return denied;
      const deniedAccion = checkAccionAccess(guard.user, itemTipo, "agregar");
      if (deniedAccion) return deniedAccion;
    }
    const creativo = await incrementarContadorObjecion(storeId, Number(body.id));
    if (!creativo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ creativo });
  }

  if (typeof body.titulo === "string") {
    if (!body.titulo.trim()) return NextResponse.json({ error: "Falta título" }, { status: 400 });

    const tituloClean = body.titulo.trim();
    const contenidoClean = (body.contenido ?? "").trim();
    const tagsClean = (body.tags ?? []).map(t => t.trim()).filter(Boolean);
    const linksClean = (body.links ?? []).map(l => l.trim()).filter(Boolean);
    const funnelClean = sanitizeFunnel(body.funnel);
    const analisisClean = sanitizeAnalisis(body);
    const anguloClean = sanitizeAngulo(body);

    if (guard.user.role !== "admin") {
      const existing = await getCreativoById(storeId, Number(body.id));
      if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      const denied = checkTabAccess(guard.user, existing.tipo);
      if (denied) return denied;

      // Sumar un archivo nuevo a una entrada que ya existe (ej. el editor
      // subiendo su video a la carpeta que ya armó el guionista) alcanza
      // con el permiso de "agregar"; tocar título/notas/tags/etc. de una
      // entrada ya creada requiere "editar". Los campos de análisis/ángulo
      // sólo se comparan cuando son relevantes para el tipo: en el resto de
      // los tipos el modal de creación los manda con su valor default
      // (ej. estadoAngulo="sin_probar") aunque no apliquen, así que
      // compararlos siempre haría que cualquier PATCH sin esos campos
      // (como el de Renovaciones, que sólo suma archivos) se marque como
      // "editar" por error.
      const soloSumaArchivo =
        existing.titulo === tituloClean &&
        existing.contenido === contenidoClean &&
        JSON.stringify(existing.tags) === JSON.stringify(tagsClean) &&
        JSON.stringify(existing.links) === JSON.stringify(linksClean) &&
        JSON.stringify(existing.funnel) === JSON.stringify(funnelClean) &&
        (existing.tipo !== "analisis" || (
          (existing.angulo ?? "") === (analisisClean.angulo ?? "") &&
          (existing.formato ?? "") === (analisisClean.formato ?? "") &&
          JSON.stringify(existing.estructura) === JSON.stringify(analisisClean.estructura) &&
          (existing.hipotesis ?? "") === (analisisClean.hipotesis ?? "")
        )) &&
        (existing.tipo !== "angulo" || (
          existing.estadoAngulo === anguloClean.estadoAngulo &&
          existing.necesitaLanding === anguloClean.necesitaLanding
        ));

      const deniedAccion = checkAccionAccess(guard.user, existing.tipo, soloSumaArchivo ? "agregar" : "editar");
      if (deniedAccion) return deniedAccion;
    }

    const creativo = await updateCreativoContenido(storeId, Number(body.id), {
      titulo: tituloClean,
      contenido: contenidoClean,
      tags: tagsClean,
      links: linksClean,
      funnel: funnelClean,
      archivosNuevos: body.archivos ?? [],
      ...analisisClean,
      ...anguloClean,
    });
    if (!creativo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ creativo });
  }

  if (body.winnerOverride != null && !OVERRIDES_VALIDOS.includes(body.winnerOverride)) {
    return NextResponse.json({ error: "winnerOverride inválido" }, { status: 400 });
  }

  if (guard.user.role !== "admin") {
    const itemTipo = await getCreativoTipo(storeId, Number(body.id));
    if (!itemTipo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const denied = checkTabAccess(guard.user, itemTipo);
    if (denied) return denied;
    const deniedAccion = checkAccionAccess(guard.user, itemTipo, "editar");
    if (deniedAccion) return deniedAccion;
  }

  const creativo = await updateCreativoMeta(storeId, Number(body.id), body.metaAdId ?? null, body.winnerOverride ?? null);
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

  if (guard.user.role !== "admin") {
    const itemTipo = await getCreativoTipo(storeId, Number(id));
    if (!itemTipo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const denied = checkTabAccess(guard.user, itemTipo);
    if (denied) return denied;
    const deniedAccion = checkAccionAccess(guard.user, itemTipo, "eliminar");
    if (deniedAccion) return deniedAccion;
  }

  const archivosBorrados = await deleteCreativo(storeId, Number(id));

  await Promise.all(
    archivosBorrados.map(a => {
      const resourceType = a.tipo_archivo === "documento" ? "raw" : a.tipo_archivo;
      return destroyAsset(a.public_id, resourceType).catch(() => {});
    }),
  );

  return NextResponse.json({ ok: true });
}
