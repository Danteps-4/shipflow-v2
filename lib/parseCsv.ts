import Papa from "papaparse";
import { TiendaNubeRow } from "@/types/orders";
import { findColumn, slugify } from "./normalizers";

// -------------------------------------------------------------------
// Columnas esperadas del CSV de Tienda Nube
// Cada entrada tiene múltiples candidatos para tolerancia a variaciones
// -------------------------------------------------------------------
export const COLUMN_CANDIDATES = {
  numeroOrden: ["Número de orden", "Numero de orden", "Nro de orden", "Order number"],
  nombreEnvio: ["Nombre para el envío", "Nombre para el envio", "Nombre envio"],
  dni: ["DNI/CUIT", "DNI", "CUIT", "DNI / CUIT"],
  email: ["Email", "E-mail", "Correo"],
  telefono: ["Teléfono para el envío", "Telefono para el envio", "Teléfono", "Telefono"],
  medioEnvio: ["Medio de envío", "Medio de envio", "Tipo de envío", "Tipo de envio"],
  direccion: ["Dirección", "Direccion", "Calle", "Dirección de entrega"],
  numero: ["Número", "Numero", "Nro", "Número de puerta"],
  piso: ["Piso"],
  localidad: ["Ciudad", "Localidad", "Ciudad/Localidad"],
  provincia: ["Provincia"],
  codigoPostal: ["Código postal", "Codigo postal", "CP", "Cod. Postal"],
  sucursal: ["Sucursal", "Punto de retiro", "Sucursal Andreani"],
};

// -------------------------------------------------------------------
// Resultado del parseo
// -------------------------------------------------------------------
export interface ParseResult {
  rows: TiendaNubeRow[];
  columnMap: Record<keyof typeof COLUMN_CANDIDATES, string | undefined>;
  headers: string[];
}

// -------------------------------------------------------------------
// Parsea el contenido de un archivo CSV de Tienda Nube
// Retorna las filas crudas y el mapa de columnas detectadas
// -------------------------------------------------------------------
export function parseCsv(csvContent: string): ParseResult {
  const result = Papa.parse<TiendaNubeRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(), // limpia espacios en encabezados
  });

  const headers = result.meta.fields ?? [];

  // Construir mapa de columna lógica => nombre real en el CSV
  const columnMap = {} as Record<keyof typeof COLUMN_CANDIDATES, string | undefined>;

  for (const [key, candidates] of Object.entries(COLUMN_CANDIDATES)) {
    columnMap[key as keyof typeof COLUMN_CANDIDATES] = findColumn(headers, candidates);
  }

  // Filtrar filas completamente vacías o sin número de orden
  const orderCol = columnMap.numeroOrden;
  const rows = result.data.filter((row) => {
    if (!orderCol) return true;
    const val = row[orderCol];
    return val && String(val).trim() !== "";
  });

  return { rows, columnMap, headers };
}

// -------------------------------------------------------------------
// Extrae el valor de una celda usando el mapa de columnas
// -------------------------------------------------------------------
export function getCell(
  row: TiendaNubeRow,
  columnMap: ParseResult["columnMap"],
  key: keyof typeof COLUMN_CANDIDATES
): string {
  const colName = columnMap[key];
  if (!colName) return "";
  return String(row[colName] ?? "").trim();
}
