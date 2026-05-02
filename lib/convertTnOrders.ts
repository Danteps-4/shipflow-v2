import type { TnOrder, GroupedOrder } from "@/types/orders";
import {
  normalizeStr,
  normalizeDni,
  normalizeTelefono,
  normalizeCodigoPostal,
  normalizeProvincia,
  normalizeLocalidad,
} from "./normalizers";
import { inferSucursal, inferHopSucursal, inferSucursalByStreet, matchSucursal } from "./andreaniMatcher";
import { lookupSucursalByAddress } from "./andreaniAddressMap";

// -------------------------------------------------------------------
// For pickup orders, TN's shipping_address.name is the pickup point
// name (e.g., "Andreani Flores", "FLORES (AV JUAN B ALBERDI)").
// Try to match it against official Andreani sucursal names.
// Also try shipping_option.name which may contain the sucursal name.
// -------------------------------------------------------------------
function inferSucursalFromPickupName(
  addrName: string,
  optionName: string,
): string {
  // Strip common prefixes like "Andreani -", "Andreani ", "PUNTO ANDREANI"
  const clean = (s: string) =>
    s.replace(/^(punto\s+)?andreani[\s-]*/i, "").trim();

  for (const raw of [addrName, optionName]) {
    if (!raw) continue;
    const cleaned = clean(raw);
    if (!cleaned) continue;
    // Try exact slugified match against official sucursal names
    const exact = matchSucursal(cleaned);
    if (exact && exact !== cleaned) return exact; // matchSucursal returns input unchanged when not found
    // Try street inference from the cleaned name (handles "FLORES AV JUAN B ALBERDI" style)
    const byStreet = inferSucursalByStreet(cleaned);
    if (byStreet) return byStreet;
  }
  return "";
}

// -------------------------------------------------------------------
// Resuelve la sucursal usando el mismo pipeline que groupOrders.ts,
// con un paso adicional al inicio para pickup point name matching.
// -------------------------------------------------------------------
function resolveSucursal(
  ciudad: string, localidad: string, cp: string,
  direccion: string, numeroDireccion: string, provincia: string,
  addrName: string, optionName: string,
): string {
  // 0. Try matching the TN pickup point name / shipping option name
  const byName = inferSucursalFromPickupName(addrName, optionName);
  if (byName) return byName;

  // 1. Address database lookup
  const byAddrMap = lookupSucursalByAddress(direccion, numeroDireccion, provincia);
  if (byAddrMap) return byAddrMap;

  // 2. HOP address match
  const hop = inferHopSucursal(direccion.toUpperCase(), numeroDireccion.toUpperCase());
  if (hop) return hop;

  // 3. Street name match against sucursal parenthetical streets
  const byStreet = inferSucursalByStreet(direccion, ciudad, localidad);
  if (byStreet) return byStreet;

  // 4. City + CP inference
  const key = ciudad || localidad;
  const { sucursal } = inferSucursal(key.toUpperCase(), cp);
  return sucursal;
}

// -------------------------------------------------------------------
// Determina si el shipping_option corresponde a retiro en sucursal
// -------------------------------------------------------------------
function isSucursalOption(opt: TnOrder["shipping_option"]): boolean {
  const raw = typeof opt === "string" ? opt : opt?.name ?? "";
  const low = raw.toLowerCase();
  return low.includes("sucursal") || low.includes("retiro") || low.includes("punto");
}

// -------------------------------------------------------------------
// Extrae el nombre de texto de shipping_option
// -------------------------------------------------------------------
function optionName(opt: TnOrder["shipping_option"]): string {
  return typeof opt === "string" ? opt : opt?.name ?? "";
}

// -------------------------------------------------------------------
// Extrae el nombre de provincia (puede ser string u objeto)
// -------------------------------------------------------------------
function extractProvincia(prov: string | { id: number; name: string; code?: string } | undefined): string {
  if (!prov) return "";
  if (typeof prov === "string") return prov;
  return prov.name ?? "";
}

// -------------------------------------------------------------------
// TN uses "No informado" as a placeholder when the customer didn't
// provide a value (common for pickup orders). Treat as empty string.
// -------------------------------------------------------------------
const TN_PLACEHOLDER = /^no\s+informado$/i;

function tnField(value: string | null | undefined): string {
  const s = normalizeStr(value ?? "");
  return TN_PLACEHOLDER.test(s) ? "" : s;
}

// -------------------------------------------------------------------
// Convierte un array de TnOrder (API) a GroupedOrder[]
// -------------------------------------------------------------------
export function convertTnOrders(orders: TnOrder[]): GroupedOrder[] {
  return orders.map((order) => {
    const addr = order.shipping_address;

    const ciudad          = tnField(addr?.city);
    const localidadRaw    = tnField(addr?.locality ?? addr?.city);
    const provRaw         = tnField(extractProvincia(addr?.province));
    const cpRaw           = tnField(addr?.zipcode);
    const direccion       = tnField(addr?.address);
    const numeroDireccion = tnField(addr?.number);
    const piso            = tnField(addr?.floor);

    const provincia    = normalizeProvincia(provRaw);
    const localidad    = normalizeLocalidad(localidadRaw);
    const codigoPostal = normalizeCodigoPostal(cpRaw);

    const esSucursal = isSucursalOption(order.shipping_option);
    const rawMedioEnvio = optionName(order.shipping_option);
    const medioEnvio = esSucursal ? "Punto de retiro" : "Andreani a Domicilio";

    const sucursal = esSucursal
      ? resolveSucursal(
          ciudad, localidad, codigoPostal, direccion, numeroDireccion, provincia,
          tnField(addr?.name),
          optionName(order.shipping_option),
        )
      : "";

    const telefono = normalizeTelefono(
      order.contact_phone ?? addr?.phone ?? ""
    );

    const dni = normalizeDni(order.contact_identification ?? "");

    return {
      numeroOrden:      String(order.number),
      nombreEnvio:      normalizeStr(addr?.name ?? order.contact_name),
      dni,
      email:            normalizeStr(order.contact_email),
      telefono,
      medioEnvio,
      direccion,
      numeroDireccion,
      piso,
      localidad,
      provincia,
      codigoPostal,
      ciudad,
      rawLocalidad:     localidadRaw,
      rawProvincia:     provRaw,
      rawCodigoPostal:  cpRaw,
      rawMedioEnvio,
      sucursal,
    };
  });
}
