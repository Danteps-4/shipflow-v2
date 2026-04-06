import { slugify } from "./normalizers";

// ─────────────────────────────────────────────────────────────────────────────
// Base de datos de direcciones de sucursales Andreani
//
// Cuando Tienda Nube envía "Punto de retiro en sucursal Andreani", el campo
// Calle/Número contiene la dirección real de la sucursal. Al tener la dirección
// exacta guardada acá, podemos resolver la sucursal sin ningún matching fuzzy.
//
// CÓMO AGREGAR UNA ENTRADA:
//   1. Abrí esta archivo
//   2. Agregá una línea al objeto ADDRESS_DB con el formato:
//        "direccion numero|provincia": "NOMBRE ANDREANI (ZONA)",
//      donde:
//        - "direccion numero" es la calle y altura tal como viene en el CSV
//          (slugificado: sin acentos, sin puntos, minúsculas)
//        - "provincia" es la provincia del Andreani (slugificada)
//        - "NOMBRE ANDREANI (ZONA)" es el nombre exacto de la sucursal
//          tal como aparece en la lista de Andreani
//
// EJEMPLO DE CÓMO SE VE EN EL CSV:
//   Calle: "Blvd. Ovidio Lagos"  |  Número: "1402"  |  Provincia: "Santa Fe"
//   → clave: "blvd ovidio lagos 1402|santa fe"
//   → valor: "CASILDA (BLVD LAGOS)"
//
// NOTA: los Punto HOP ya están manejados por inferHopSucursal, no los agregues acá.
// ─────────────────────────────────────────────────────────────────────────────

const ADDRESS_DB: Record<string, string> = {

  // ── CAPITAL FEDERAL ──────────────────────────────────────────────────────────
  "av cabildo 1386|capital federal":                "BELGRANO (AV CABILDO)",
  "av belgrano 1211|capital federal":               "MONSERRAT (AV BELGRANO)",
  "av corrientes 455|capital federal":              "MICROCENTRO (AV CORRIENTES)",

  // ── BUENOS AIRES ────────────────────────────────────────────────────────────
  "pres juan domingo peron 1237|buenos aires":      "TRENQUE LAUQUEN (PRES J D PERON)",
  "mendoza 2552|buenos aires":                      "SAN JUSTO (CENTRO)",
  "av constitucion 4632|buenos aires":              "MAR DEL PLATA (AV CONSTITUCION)",

  // ── MISIONES ────────────────────────────────────────────────────────────────
  "colon 1647|misiones":                            "POSADAS (CENTRO)",

  // ── SANTA FE ────────────────────────────────────────────────────────────────
  "blvd ovidio lagos 1402|santa fe":                "CASILDA (BLVD LAGOS)",

  // ── SAN LUIS ────────────────────────────────────────────────────────────────
  "belgrano 452|san luis":                          "VILLA MERCEDES (CENTRO)",

  // ── TUCUMAN ─────────────────────────────────────────────────────────────────
  "gral jose de san martin 1175|tucuman":           "TUCUMAN (CENTRO)",

  // ── SALTA ────────────────────────────────────────────────────────────────────
  "cerro los tres zorritos 600|salta":              "SALTA (CIRC. OESTE)",

  // ── Agregar nuevas entradas abajo ──────────────────────────────────────────
  //  "calle numero|provincia": "NOMBRE ANDREANI (ZONA)",

};

// ─────────────────────────────────────────────────────────────────────────────
// Busca la sucursal a partir de la dirección exacta del pedido.
//
// @param direccion  — campo Calle del CSV (ej: "Blvd. Ovidio Lagos")
// @param numero     — campo Número del CSV (ej: "1402")
// @param provincia  — provincia normalizada (ej: "SANTA FE")
// @returns nombre de la sucursal Andreani, o "" si no hay coincidencia
// ─────────────────────────────────────────────────────────────────────────────
export function lookupSucursalByAddress(
  direccion: string,
  numero:    string,
  provincia: string,
): string {
  const addrSlug = slugify(`${direccion} ${numero}`.replace(/\s+/g, " ").trim());
  const provSlug = slugify(provincia);

  // Búsqueda primaria: dirección + provincia
  const withProv = ADDRESS_DB[`${addrSlug}|${provSlug}`];
  if (withProv) return withProv;

  // Búsqueda secundaria: solo dirección (útil si la provincia viene mal escrita o vacía)
  const addrOnly = ADDRESS_DB[addrSlug];
  if (addrOnly) return addrOnly;

  return "";
}
