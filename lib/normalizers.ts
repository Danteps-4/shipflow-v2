// Funciones de normalización de strings y datos

// -------------------------------------------------------------------
// Normaliza un string: trim + colapso de espacios dobles
// -------------------------------------------------------------------
export function normalizeStr(value: string | undefined | null): string {
  if (!value) return "";
  return value.trim().replace(/\s{2,}/g, " ");
}

// -------------------------------------------------------------------
// Quita acentos y convierte a minúsculas para comparaciones fuzzy
// Ej: "Número de orden" => "numero de orden"
// -------------------------------------------------------------------
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita diacríticos
    .replace(/[^\w\s]/g, "")         // quita caracteres especiales
    .trim();
}

// -------------------------------------------------------------------
// Busca un encabezado de columna de forma robusta:
// tolera diferencias de acentos, mayúsculas y espacios extras
// -------------------------------------------------------------------
export function findColumn(
  headers: string[],
  candidates: string[]
): string | undefined {
  const sluggedHeaders = headers.map((h) => ({ original: h, slug: slugify(h) }));
  for (const candidate of candidates) {
    const sluggedCandidate = slugify(candidate);
    const match = sluggedHeaders.find((h) => h.slug === sluggedCandidate);
    if (match) return match.original;
  }
  return undefined;
}

// -------------------------------------------------------------------
// Normaliza el DNI/CUIT:
// Elimina ".0" final (artefacto de Excel) y caracteres no numéricos
// Ej: "21175407.0" => "21175407"
// -------------------------------------------------------------------
export function normalizeDni(value: string): string {
  return normalizeStr(value)
    .replace(/\.0+$/, "")   // quita el ".0" de Excel
    .replace(/[^0-9]/g, ""); // solo dígitos
}

// -------------------------------------------------------------------
// Normaliza el teléfono:
// Elimina espacios, guiones, +, comas, puntos y ".0" de Excel
// -------------------------------------------------------------------
export function normalizeTelefono(value: string): string {
  return normalizeStr(value)
    .replace(/\.0+$/, "")
    .replace(/[\s\-+,.]/g, "");
}

// -------------------------------------------------------------------
// Normaliza el código postal:
// Elimina ".0" y caracteres no alfanuméricos
// -------------------------------------------------------------------
export function normalizeCodigoPostal(value: string): string {
  return normalizeStr(value)
    .replace(/\.0+$/, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

// Map de normalización de provincias
// Los valores deben coincidir EXACTAMENTE con los nombres en la lista de Andreani
const PROVINCIA_MAP: Record<string, string> = {
  // CABA — Andreani usa "CAPITAL FEDERAL"
  "capital federal": "CAPITAL FEDERAL",
  "ciudad autonoma de buenos aires": "CAPITAL FEDERAL",
  "ciudad de buenos aires": "CAPITAL FEDERAL",
  "caba": "CAPITAL FEDERAL",
  // Buenos Aires
  "buenos aires": "BUENOS AIRES",
  "gran buenos aires": "BUENOS AIRES",
  "pcia. de buenos aires": "BUENOS AIRES",
  "pcia de buenos aires": "BUENOS AIRES",
  "provincia de buenos aires": "BUENOS AIRES",
  "bs as": "BUENOS AIRES",
  "bs. as.": "BUENOS AIRES",
  // Resto — sin acentos, tal como aparecen en Andreani
  "cordoba": "CORDOBA",
  "santa fe": "SANTA FE",
  "entre rios": "ENTRE RIOS",
  "mendoza": "MENDOZA",
  "tucuman": "TUCUMAN",
  "salta": "SALTA",
  "misiones": "MISIONES",
  "chaco": "CHACO",
  "corrientes": "CORRIENTES",
  "santiago del estero": "SANTIAGO DEL ESTERO",
  "san juan": "SAN JUAN",
  "jujuy": "JUJUY",
  "rio negro": "RIO NEGRO",
  "neuquen": "NEUQUEN",
  "formosa": "FORMOSA",
  "chubut": "CHUBUT",
  "san luis": "SAN LUIS",
  "catamarca": "CATAMARCA",
  "la rioja": "LA RIOJA",
  "la pampa": "LA PAMPA",
  "santa cruz": "SANTA CRUZ",
  "tierra del fuego": "TIERRA DEL FUEGO",
};

// -------------------------------------------------------------------
// Normaliza el nombre de la provincia al formato estándar
// -------------------------------------------------------------------
export function normalizeProvincia(value: string): string {
  const key = slugify(value);
  return PROVINCIA_MAP[key] ?? value.toUpperCase().trim();
}

// -------------------------------------------------------------------
// Normaliza localidad a mayúsculas
// -------------------------------------------------------------------
export function normalizeLocalidad(value: string): string {
  return normalizeStr(value).toUpperCase();
}

// -------------------------------------------------------------------
// Sanitiza un campo de texto para el Excel de Andreani.
// Andreani rechaza ciertos caracteres en los campos del Excel:
//   - Guión/dash (-)       → se reemplaza por espacio
//   - Grado/barrio (°)     → se elimina  (Bº → B)
//   - Barra (/)            → se reemplaza por espacio
//   - Apóstrofe (' y `)    → se elimina  (O'Brien → OBrien)
//   - Comillas (" y « »)   → se elimina
//   - Almohadilla (#)      → se elimina
//   - Paréntesis ( )       → se reemplaza por espacio
//   - Punto y coma (;)     → se reemplaza por espacio
//   - Barra invertida (\)  → se reemplaza por espacio
//   - Pipe (|)             → se reemplaza por espacio
// Letras, números, espacios, puntos y acentos/ñ se conservan.
// -------------------------------------------------------------------
export function sanitizeAndreani(value: string): string {
  if (!value) return value;
  return value
    .replace(/[-/\\|;()\[\]{}]/g, " ")  // reemplaza separadores por espacio
    .replace(/[°'""`«»#]/g, "")          // elimina caracteres decorativos/inválidos
    .replace(/\s{2,}/g, " ")             // colapsa espacios dobles
    .trim();
}

// -------------------------------------------------------------------
// Separa "Nombre completo" en { nombre, apellido }
// Primera palabra = Nombre, el resto = Apellido
// -------------------------------------------------------------------
export function splitNombreApellido(nombreCompleto: string): {
  nombre: string;
  apellido: string;
} {
  const parts = normalizeStr(nombreCompleto).split(" ").filter(Boolean);
  if (parts.length === 0) return { nombre: "", apellido: "" };
  const [nombre, ...rest] = parts;
  return { nombre, apellido: rest.join(" ") };
}
