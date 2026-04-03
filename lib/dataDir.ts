import path from "path";

/**
 * Directorio donde se guardan los datos persistentes (usuarios, tiendas).
 * En producción con Railway/Render se monta un volumen en DATA_DIR.
 * En desarrollo local usa la raíz del proyecto.
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.cwd();
