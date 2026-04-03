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
import { inferSucursal, inferHopSucursal, inferSucursalByStreet } from "./andreaniMatcher";
import { lookupSucursalByAddress } from "./andreaniAddressMap";

// -------------------------------------------------------------------
// Resuelve la sucursal Andreani:
// - Si el CSV ya trae un nombre de sucursal, lo usa tal cual
//   (matchSucursal lo normalizará en transformOrders)
// - Si está vacío (Tienda Nube solo dice "Punto de retiro"),
//   intenta inferirla por localidad/CP. Si hay exactamente una
//   coincidencia la usa; si hay varias o ninguna deja vacío
//   para que aparezca como error y el usuario la elija manualmente.
// -------------------------------------------------------------------
function resolveSucursal(
  raw: string, ciudad: string, localidad: string, cp: string,
  direccion: string, numeroDireccion: string, provincia: string,
): string {
  if (raw) return raw;

  // 1. Exact address database: "Blvd. Ovidio Lagos 1402, Santa Fe" → "CASILDA (BLVD LAGOS)"
  //    This is the most reliable match — no fuzzy logic needed.
  const byAddrMap = lookupSucursalByAddress(direccion, numeroDireccion, provincia);
  if (byAddrMap) return byAddrMap;

  // 2. HOP address: "Punto de retiro" orders where TN stores the HOP point address
  //    in the Calle field (e.g. "Avenida Nazca 733" → "PUNTO ANDREANI HOP AVENIDA NAZCA 733").
  const hop = inferHopSucursal(direccion.toUpperCase(), numeroDireccion.toUpperCase());
  if (hop) return hop;

  // 3. Parenthetical street name match with two-tier city filter.
  //    e.g. "Av. Juan B. Alberdi 3138" in Flores → "FLORES (AV JUAN B ALBERDI)"
  //    e.g. "Av. Álvarez Thomas 2621" in V.Urquiza → "VILLA URQUIZA (AV ALVAREZ TOMAS)"
  const byStreet = inferSucursalByStreet(direccion, ciudad, localidad);
  if (byStreet) return byStreet;

  // 4. City + CP inference (includes CITY_TO_SUCURSAL alias map).
  const key = ciudad || localidad;
  const { sucursal } = inferSucursal(key.toUpperCase(), cp);
  return sucursal;
}

// -------------------------------------------------------------------
// Devuelve el primer teléfono útil: usa el de envío si no está vacío
// ni dice "no informado" (valor que pone Tienda Nube cuando falta).
// Si está vacío/no informado, cae al teléfono del comprador.
// -------------------------------------------------------------------
function resolverTelefono(telefonoEnvio: string, telefonoComprador: string): string {
  const envio = telefonoEnvio.trim().toLowerCase();
  if (envio && envio !== "no informado") return telefonoEnvio;
  return telefonoComprador;
}

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

    // Guardar valores crudos antes de normalizar (para comparativa en la UI)
    const rawLocalidad    = normalizeStr(getCell(row, columnMap, "localidad"));
    const rawProvincia    = normalizeStr(getCell(row, columnMap, "provincia"));
    const rawCodigoPostal = normalizeStr(getCell(row, columnMap, "codigoPostal"));

    const order: GroupedOrder = {
      numeroOrden,
      ciudad: normalizeStr(getCell(row, columnMap, "ciudad")),
      nombreEnvio: normalizeStr(getCell(row, columnMap, "nombreEnvio")),
      dni: normalizeDni(getCell(row, columnMap, "dni")),
      email: normalizeStr(getCell(row, columnMap, "email")),
      telefono: normalizeTelefono(resolverTelefono(
        getCell(row, columnMap, "telefonoEnvio"),
        getCell(row, columnMap, "telefonoComprador"),
      )),
      medioEnvio: normalizeStr(getCell(row, columnMap, "medioEnvio")),
      direccion: normalizeStr(getCell(row, columnMap, "direccion")),
      numeroDireccion: normalizeStr(getCell(row, columnMap, "numero")),
      piso: normalizeStr(getCell(row, columnMap, "piso")),
      localidad: normalizeLocalidad(rawLocalidad),
      provincia: normalizeProvincia(rawProvincia),
      codigoPostal: normalizeCodigoPostal(rawCodigoPostal),
      rawLocalidad,
      rawProvincia,
      rawCodigoPostal,
      sucursal: resolveSucursal(
        normalizeStr(getCell(row, columnMap, "sucursal")),
        normalizeStr(getCell(row, columnMap, "ciudad")),
        normalizeStr(getCell(row, columnMap, "localidad")),
        normalizeStr(getCell(row, columnMap, "codigoPostal")),
        normalizeStr(getCell(row, columnMap, "direccion")),
        normalizeStr(getCell(row, columnMap, "numero")),
        normalizeProvincia(normalizeStr(getCell(row, columnMap, "provincia"))),
      ),
    };

    orderMap.set(numeroOrden, order);
  }

  return Array.from(orderMap.values());
}
