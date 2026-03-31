import { TiendaNubeRow, GroupedOrder } from "@/types/orders";
import { ParseResult, getCell } from "./parseCsv";
import {
  normalizeStr,
  normalizeDni,
  normalizeTelefono,
  normalizeCodigoPostal,
  normalizeProvincia,
  normalizeLocalidad,
} from "./normalizers";

// -------------------------------------------------------------------
// Agrupa las filas del CSV por número de orden.
// Una orden puede tener múltiples filas (una por producto), pero
// solo necesitamos un registro de envío por orden.
// Usamos la PRIMERA fila de cada orden para los datos de envío.
// -------------------------------------------------------------------
export function groupOrders(
  rows: TiendaNubeRow[],
  columnMap: ParseResult["columnMap"]
): GroupedOrder[] {
  // Mapa: numeroOrden => GroupedOrder (primera aparición)
  const orderMap = new Map<string, GroupedOrder>();

  for (const row of rows) {
    const numeroOrden = normalizeStr(getCell(row, columnMap, "numeroOrden"));
    if (!numeroOrden) continue;

    // Si ya procesamos esta orden, saltamos (evitamos duplicados)
    if (orderMap.has(numeroOrden)) continue;

    const order: GroupedOrder = {
      numeroOrden,
      nombreEnvio: normalizeStr(getCell(row, columnMap, "nombreEnvio")),
      dni: normalizeDni(getCell(row, columnMap, "dni")),
      email: normalizeStr(getCell(row, columnMap, "email")),
      telefono: normalizeTelefono(getCell(row, columnMap, "telefono")),
      medioEnvio: normalizeStr(getCell(row, columnMap, "medioEnvio")),
      direccion: normalizeStr(getCell(row, columnMap, "direccion")),
      numeroDireccion: normalizeStr(getCell(row, columnMap, "numero")),
      piso: normalizeStr(getCell(row, columnMap, "piso")),
      localidad: normalizeLocalidad(getCell(row, columnMap, "localidad")),
      provincia: normalizeProvincia(getCell(row, columnMap, "provincia")),
      codigoPostal: normalizeCodigoPostal(getCell(row, columnMap, "codigoPostal")),
      sucursal: normalizeStr(getCell(row, columnMap, "sucursal")),
    };

    orderMap.set(numeroOrden, order);
  }

  return Array.from(orderMap.values());
}
