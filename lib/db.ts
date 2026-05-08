import { neon } from "@neondatabase/serverless";

// Lazy initialization: la conexión se crea la primera vez que se usa,
// no al importar el módulo. Esto evita errores durante el build de Railway
// cuando DATABASE_URL todavía no está disponible como variable de entorno.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: ReturnType<typeof neon> | null = null;

export function getDb(): ReturnType<typeof neon> {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada en las variables de entorno.");
    _db = neon(url);
  }
  return _db;
}
