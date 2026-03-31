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
const PROVINCIA_MAP: Record<string, string> = {
  "capital federal": "CIUDAD AUTONOMA DE BUENOS AIRES",
  "ciudad autonoma de buenos aires": "CIUDAD AUTONOMA DE BUENOS AIRES",
  "ciudad de buenos aires": "CIUDAD AUTONOMA DE BUENOS AIRES",
  "caba": "CIUDAD AUTONOMA DE BUENOS AIRES",
  "cordoba": "CORDOBA",
  "córdoba": "CORDOBA",
  "buenos aires": "BUENOS AIRES",
  "gran buenos aires": "BUENOS AIRES",
  "pcia. de buenos aires": "BUENOS AIRES",
  "pcia de buenos aires": "BUENOS AIRES",
  "provincia de buenos aires": "BUENOS AIRES",
  "santa fe": "SANTA FE",
  "entre rios": "ENTRE RIOS",
  "entre ríos": "ENTRE RIOS",
  "mendoza": "MENDOZA",
  "tucuman": "TUCUMAN",
  "tucumán": "TUCUMAN",
  "salta": "SALTA",
  "misiones": "MISIONES",
  "chaco": "CHACO",
  "corrientes": "CORRIENTES",
  "santiago del estero": "SANTIAGO DEL ESTERO",
  "san juan": "SAN JUAN",
  "jujuy": "JUJUY",
  "rio negro": "RIO NEGRO",
  "río negro": "RIO NEGRO",
  "neuquen": "NEUQUEN",
  "neuquén": "NEUQUEN",
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
