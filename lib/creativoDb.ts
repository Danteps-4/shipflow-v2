import { getDb } from "./db";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoCreativo = "angulo" | "guion" | "formato" | "anuncio";
export type TipoArchivo = "image" | "video";
export type WinnerOverride = "winner" | "regular" | "malo";

export interface CreativoArchivo {
  id: number;
  url: string;
  public_id: string;
  tipo_archivo: TipoArchivo;
}

export interface Creativo {
  id: number;
  tipo: TipoCreativo;
  titulo: string;
  contenido: string;
  tags: string[];
  created_by: string;
  created_at: string;
  archivos: CreativoArchivo[];
  meta_ad_id: string | null;
  winner_override: WinnerOverride | null;
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
  // real de Meta + el override manual de winner/regular/malo.
  await sql`ALTER TABLE creativos DROP CONSTRAINT IF EXISTS creativos_tipo_check`;
  await sql`ALTER TABLE creativos ADD CONSTRAINT creativos_tipo_check CHECK (tipo IN ('angulo','guion','formato','anuncio'))`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS meta_ad_id TEXT`;
  await sql`ALTER TABLE creativos ADD COLUMN IF NOT EXISTS winner_override TEXT`;

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
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function getCreativos(
  storeId: string, filtros: { tipo?: TipoCreativo; tag?: string } = {},
): Promise<Creativo[]> {
  const sql = getDb();

  const rows = await sql`
    SELECT c.id, c.tipo, c.titulo, c.contenido, c.tags, c.created_by, c.created_at,
           c.meta_ad_id, c.winner_override,
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
    archivo_id: number | null; archivo_url: string | null; archivo_public_id: string | null;
    archivo_tipo: TipoArchivo | null;
  }[];

  const porId = new Map<number, Creativo>();
  for (const r of rows) {
    if (!porId.has(r.id)) {
      porId.set(r.id, {
        id: r.id, tipo: r.tipo, titulo: r.titulo, contenido: r.contenido,
        tags: r.tags, created_by: r.created_by, created_at: r.created_at, archivos: [],
        meta_ad_id: r.meta_ad_id, winner_override: r.winner_override,
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
  data: { tipo: TipoCreativo; titulo: string; contenido: string; tags: string[]; createdBy: string; archivos: NuevoArchivo[] },
): Promise<Creativo> {
  const sql = getDb();

  const rows = await sql`
    INSERT INTO creativos (store_id, tipo, titulo, contenido, tags, created_by, created_at)
    VALUES (${storeId}, ${data.tipo}, ${data.titulo}, ${data.contenido}, ${data.tags}, ${data.createdBy}, NOW())
    RETURNING id, tipo, titulo, contenido, tags, created_by, created_at, meta_ad_id, winner_override
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
    RETURNING id, tipo, titulo, contenido, tags, created_by, created_at, meta_ad_id, winner_override
  ` as Omit<Creativo, "archivos">[];
  if (!rows[0]) return null;

  const archivos = await sql`
    SELECT id, url, public_id, tipo_archivo FROM creativo_archivos WHERE creativo_id = ${id}
  ` as CreativoArchivo[];

  return { ...rows[0], archivos };
}
