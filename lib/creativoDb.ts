import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoCreativo = "angulo" | "guion" | "formato" | "anuncio" | "referencia" | "renovacion" | "marca" | "analisis";
export type TipoArchivo = "image" | "video" | "documento";
export type WinnerOverride = "winner" | "regular" | "malo";

export interface CreativoArchivo {
  id: number;
  url: string;
  public_id: string;
  tipo_archivo: TipoArchivo;
}

// Una etapa del guion armada a mano (ej. "Hook", "CTA", o cualquier otro
// nombre que el usuario elija) — no hay una estructura fija, cada
// renovación puede tener las etapas que su guion realmente tenga.
export interface EtapaGuion {
  titulo: string;
  texto: string;
}

// Campos propios del análisis de renovación: ángulo, formato, el guion
// desglosado en etapas libres (definidas por el usuario, no fijas) e
// hipótesis. Sólo se usan cuando tipo === "analisis"; en el resto de los
// tipos quedan null/vacío.
export interface Creativo {
  id: number;
  tipo: TipoCreativo;
  titulo: string;
  contenido: string;
  tags: string[];
  created_by: string;
  created_at: string;
  archivos: CreativoArchivo[];
  links: string[];
  funnel: string[];
  meta_ad_id: string | null;
  winner_override: WinnerOverride | null;
  angulo: string | null;
  formato: string | null;
  estructura: EtapaGuion[];
  hipotesis: string | null;
}

export interface NuevoArchivo {
  url: string;
  publicId: string;
  tipoArchivo: TipoArchivo;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initCreativoTables(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS creativos (
      id           SERIAL PRIMARY KEY,
      store_id     TEXT NOT NULL,
      tipo         TEXT NOT NULL CHECK (tipo IN ('angulo','guion','formato')),
      titulo       TEXT NOT NULL,
      contenido    TEXT NOT NULL DEFAULT '',
      tags         TEXT[] NOT NULL DEFAULT '{}',
      created_by   TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS creativos_store_tipo ON creativos (store_id, tipo)
  `;

  // Migración: permitir tipo 'anuncio' y guardar el vínculo con el anuncio
  // real de Meta + el override manual de winner/regular/malo. Más tarde se
  // sumó 'referencia' para la galería de ejemplos de video/imagen,
  // 'renovacion' para las carpetas de guion + video editado, 'marca' para
  // perfiles de marcas de inspiración (notas + links + archivos de ejemplo),
  // y 'analisis' para el desglose de guion/estructura de una renovación.
  await sql`ALTER TABLE creativos DROP CONSTRAINT IF EXISTS creativos_tipo_check`;
  await sql`ALTER TABLE creativos ADD CONSTRAINT creativos_tipo_check CHECK (tipo IN ('angulo','guion','formato','anuncio','referencia','renovacion','marca','analisis'))`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS meta_ad_id TEXT`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS winner_override TEXT`;
  // Links externos (ej. material de referencia que todavía no se descargó).
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS links TEXT[] NOT NULL DEFAULT '{}'`;
  // Clasificación de funnel (TOF/MOF/BOF) para las referencias de imagen;
  // una misma referencia puede tener más de una a la vez.
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS funnel_tags TEXT[] NOT NULL DEFAULT '{}'`;
  // Campos del análisis de renovación (tipo 'analisis'): ángulo, formato e
  // hipótesis. El guion se desglosa en etapas libres (título + texto que
  // el usuario define a medida que arma el guion, no una estructura fija)
  // guardadas como JSONB; reemplaza las columnas fijas hook/promesa_solucion/
  // profundizacion_problema/presentacion_producto/beneficios_alivio/cta de
  // la primera versión de este tipo, que nunca llegó a tener datos reales.
  await sql`ALTER TABLE creativos DROP COLUMN IF EXISTS hook`;
  await sql`ALTER TABLE creativos DROP COLUMN IF EXISTS promesa_solucion`;
  await sql`ALTER TABLE creativos DROP COLUMN IF EXISTS profundizacion_problema`;
  await sql`ALTER TABLE creativos DROP COLUMN IF EXISTS presentacion_producto`;
  await sql`ALTER TABLE creativos DROP COLUMN IF EXISTS beneficios_alivio`;
  await sql`ALTER TABLE creativos DROP COLUMN IF EXISTS cta`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS angulo TEXT`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS formato TEXT`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS estructura_guion JSONB NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS hipotesis TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS creativo_archivos (
      id           SERIAL PRIMARY KEY,
      creativo_id  INTEGER NOT NULL REFERENCES creativos(id) ON DELETE CASCADE,
      url          TEXT NOT NULL,
      public_id    TEXT NOT NULL,
      tipo_archivo TEXT NOT NULL CHECK (tipo_archivo IN ('image','video')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Migración: 'documento' para los archivos de guion (pdf/doc/txt) que se
  // suben en las carpetas de renovación, además de imagen/video.
  await sql`ALTER TABLE creativo_archivos DROP CONSTRAINT IF EXISTS creativo_archivos_tipo_archivo_check`;
  await sql`ALTER TABLE creativo_archivos ADD CONSTRAINT creativo_archivos_tipo_archivo_check CHECK (tipo_archivo IN ('image','video','documento'))`;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function getCreativos(
  storeId: string, filtros: { tipo?: TipoCreativo; tag?: string } = {},
): Promise<Creativo[]> {
  const sql = getDb();

  const rows = await sql`
    SELECT c.id, c.tipo, c.titulo, c.contenido, c.tags, c.created_by, c.created_at,
           c.meta_ad_id, c.winner_override, c.links, c.funnel_tags,
           c.angulo, c.formato, c.estructura_guion, c.hipotesis,
           a.id AS archivo_id, a.url AS archivo_url, a.public_id AS archivo_public_id,
           a.tipo_archivo AS archivo_tipo
    FROM creativos c
    LEFT JOIN creativo_archivos a ON a.creativo_id = c.id
    WHERE c.store_id = ${storeId}
      AND (${filtros.tipo ?? null}::text IS NULL OR c.tipo = ${filtros.tipo ?? null})
      AND (${filtros.tag ?? null}::text IS NULL OR ${filtros.tag ?? null} = ANY(c.tags))
    ORDER BY c.created_at DESC, a.created_at
  ` as {
    id: number; tipo: TipoCreativo; titulo: string; contenido: string; tags: string[];
    created_by: string; created_at: string; meta_ad_id: string | null; winner_override: WinnerOverride | null;
    links: string[]; funnel_tags: string[];
    angulo: string | null; formato: string | null; estructura_guion: EtapaGuion[]; hipotesis: string | null;
    archivo_id: number | null; archivo_url: string | null; archivo_public_id: string | null;
    archivo_tipo: TipoArchivo | null;
  }[];

  const porId = new Map<number, Creativo>();
  for (const r of rows) {
    if (!porId.has(r.id)) {
      porId.set(r.id, {
        id: r.id, tipo: r.tipo, titulo: r.titulo, contenido: r.contenido,
        tags: r.tags, created_by: r.created_by, created_at: r.created_at, archivos: [],
        links: r.links, funnel: r.funnel_tags, meta_ad_id: r.meta_ad_id, winner_override: r.winner_override,
        angulo: r.angulo, formato: r.formato, estructura: r.estructura_guion ?? [], hipotesis: r.hipotesis,
      });
    }
    if (r.archivo_id !== null) {
      porId.get(r.id)!.archivos.push({
        id: r.archivo_id, url: r.archivo_url!, public_id: r.archivo_public_id!, tipo_archivo: r.archivo_tipo!,
      });
    }
  }

  return Array.from(porId.values());
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function createCreativo(
  storeId: string,
  data: {
    tipo: TipoCreativo; titulo: string; contenido: string; tags: string[]; createdBy: string;
    archivos: NuevoArchivo[]; links?: string[]; funnel?: string[];
    angulo?: string; formato?: string; estructura?: EtapaGuion[]; hipotesis?: string;
  },
): Promise<Creativo> {
  const sql = getDb();

  const rows = await sql`
    INSERT INTO creativos (
      store_id, tipo, titulo, contenido, tags, created_by, created_at, links, funnel_tags,
      angulo, formato, estructura_guion, hipotesis
    )
    VALUES (
      ${storeId}, ${data.tipo}, ${data.titulo}, ${data.contenido}, ${data.tags}, ${data.createdBy}, NOW(), ${data.links ?? []}, ${data.funnel ?? []},
      ${data.angulo ?? null}, ${data.formato ?? null}, ${JSON.stringify(data.estructura ?? [])}::jsonb, ${data.hipotesis ?? null}
    )
    RETURNING id, tipo, titulo, contenido, tags, created_by, created_at, meta_ad_id, winner_override, links, funnel_tags AS funnel,
      angulo, formato, estructura_guion AS estructura, hipotesis
  ` as Omit<Creativo, "archivos">[];
  const creativo = rows[0];

  const archivos: CreativoArchivo[] = [];
  for (const a of data.archivos) {
    const archivoRows = await sql`
      INSERT INTO creativo_archivos (creativo_id, url, public_id, tipo_archivo, created_at)
      VALUES (${creativo.id}, ${a.url}, ${a.publicId}, ${a.tipoArchivo}, NOW())
      RETURNING id, url, public_id, tipo_archivo
    ` as CreativoArchivo[];
    archivos.push(archivoRows[0]);
  }

  return { ...creativo, archivos };
}

// Para chequear permisos por sub apartado (ver lib/navGroups.ts) antes de
// editar/borrar: hace falta saber el tipo de una entrada existente sin
// traer el resto de sus datos.
export async function getCreativoTipo(storeId: string, id: number): Promise<TipoCreativo | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT tipo FROM creativos WHERE store_id = ${storeId} AND id = ${id}
  ` as { tipo: TipoCreativo }[];
  return rows[0]?.tipo ?? null;
}

// Borra la entrada (los archivos se borran solos por ON DELETE CASCADE) y
// devuelve los archivos borrados para que quien llame limpie Cloudinary.
export async function deleteCreativo(storeId: string, id: number): Promise<CreativoArchivo[]> {
  const sql = getDb();

  const archivos = await sql`
    SELECT a.id, a.url, a.public_id, a.tipo_archivo
    FROM creativo_archivos a
    JOIN creativos c ON c.id = a.creativo_id
    WHERE c.store_id = ${storeId} AND c.id = ${id}
  ` as CreativoArchivo[];

  await sql`DELETE FROM creativos WHERE store_id = ${storeId} AND id = ${id}`;

  return archivos;
}

// Edita título/contenido/tags/links/funnel de una entrada existente (ej. el
// editor corrigiendo la nota de un ejemplo de referencia) y opcionalmente
// suma nuevos archivos (ej. agregar más videos a un mismo formato ya creado).
// Los links/funnel se reemplazan completos (igual que tags); los archivos
// solo se suman a los que ya había.
export async function updateCreativoContenido(
  storeId: string, id: number,
  data: {
    titulo: string; contenido: string; tags: string[]; links?: string[]; funnel?: string[];
    angulo?: string; formato?: string; estructura?: EtapaGuion[]; hipotesis?: string;
    archivosNuevos?: NuevoArchivo[];
  },
): Promise<Creativo | null> {
  const sql = getDb();

  const rows = await sql`
    UPDATE creativos
    SET titulo = ${data.titulo}, contenido = ${data.contenido}, tags = ${data.tags},
        links = ${data.links ?? []}, funnel_tags = ${data.funnel ?? []},
        angulo = ${data.angulo ?? null}, formato = ${data.formato ?? null},
        estructura_guion = ${JSON.stringify(data.estructura ?? [])}::jsonb, hipotesis = ${data.hipotesis ?? null}
    WHERE store_id = ${storeId} AND id = ${id}
    RETURNING id, tipo, titulo, contenido, tags, created_by, created_at, meta_ad_id, winner_override, links, funnel_tags AS funnel,
      angulo, formato, estructura_guion AS estructura, hipotesis
  ` as Omit<Creativo, "archivos">[];
  if (!rows[0]) return null;

  for (const a of data.archivosNuevos ?? []) {
    await sql`
      INSERT INTO creativo_archivos (creativo_id, url, public_id, tipo_archivo)
      VALUES (${id}, ${a.url}, ${a.publicId}, ${a.tipoArchivo})
    `;
  }

  const archivos = await sql`
    SELECT id, url, public_id, tipo_archivo FROM creativo_archivos WHERE creativo_id = ${id}
  ` as CreativoArchivo[];

  return { ...rows[0], archivos };
}

// Vincula/desvincula un anuncio de Meta y/o fija el override manual de
// winner/regular/malo. El caller siempre manda el estado completo de ambos
// campos (no hace falta un UPDATE parcial dinámico).
export async function updateCreativoMeta(
  storeId: string, id: number, metaAdId: string | null, winnerOverride: WinnerOverride | null,
): Promise<Creativo | null> {
  const sql = getDb();

  const rows = await sql`
    UPDATE creativos
    SET meta_ad_id = ${metaAdId}, winner_override = ${winnerOverride}
    WHERE store_id = ${storeId} AND id = ${id}
    RETURNING id, tipo, titulo, contenido, tags, created_by, created_at, meta_ad_id, winner_override, links, funnel_tags AS funnel,
      angulo, formato, estructura_guion AS estructura, hipotesis
  ` as Omit<Creativo, "archivos">[];
  if (!rows[0]) return null;

  const archivos = await sql`
    SELECT id, url, public_id, tipo_archivo FROM creativo_archivos WHERE creativo_id = ${id}
  ` as CreativoArchivo[];

  return { ...rows[0], archivos };
}
