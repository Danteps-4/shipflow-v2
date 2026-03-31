import * as XLSX from "xlsx";
import { AndreaniDomicilio, AndreaniSucursal } from "@/types/orders";

// -------------------------------------------------------------------
// Columnas en el orden exacto para cada hoja del Excel final
// -------------------------------------------------------------------
const COLS_DOMICILIO: (keyof AndreaniDomicilio)[] = [
  "Paquete Guardado",
  "Peso (grs)",
  "Alto (cm)",
  "Ancho (cm)",
  "Profundidad (cm)",
  "Valor declarado ($ c/IVA)",
  "Numero Interno",
  "Nombre",
  "Apellido",
  "DNI",
  "Email",
  "Celular código",
  "Celular número",
  "Calle",
  "Número",
  "Piso",
  "Departamento",
  "Provincia / Localidad / CP",
  "Observaciones",
];

const COLS_SUCURSAL: (keyof AndreaniSucursal)[] = [
  "Paquete Guardado",
  "Peso (grs)",
  "Alto (cm)",
  "Ancho (cm)",
  "Profundidad (cm)",
  "Valor declarado ($ c/IVA)",
  "Numero Interno",
  "Nombre",
  "Apellido",
  "DNI",
  "Email",
  "Celular código",
  "Celular número",
  "Sucursal",
];

// -------------------------------------------------------------------
// Convierte un array de objetos a una worksheet de SheetJS,
// respetando el orden de columnas especificado
// -------------------------------------------------------------------
function buildWorksheet<T>(
  data: T[],
  columns: (keyof T)[]
): XLSX.WorkSheet {
  // Construimos array de arrays: primera fila = encabezados
  const header = columns.map((c) => String(c));
  const rows = data.map((item) =>
    columns.map((col) => {
      const val = (item as Record<keyof T, unknown>)[col];
      // Convertir undefined/null a string vacío
      return val !== undefined && val !== null ? val : "";
    })
  );

  const wsData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Ajuste de ancho de columnas (estimado)
  ws["!cols"] = header.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

  return ws;
}

// -------------------------------------------------------------------
// Genera el workbook Excel con las dos hojas y lo descarga en el browser
// -------------------------------------------------------------------
export function exportAndreaniWorkbook(
  domicilio: AndreaniDomicilio[],
  sucursal: AndreaniSucursal[]
): void {
  const wb = XLSX.utils.book_new();

  const wsDomicilio = buildWorksheet(domicilio, COLS_DOMICILIO);
  const wsSucursal = buildWorksheet(sucursal, COLS_SUCURSAL);

  XLSX.utils.book_append_sheet(wb, wsDomicilio, "A domicilio");
  XLSX.utils.book_append_sheet(wb, wsSucursal, "A sucursal");

  // Genera y descarga el archivo en el navegador
  XLSX.writeFile(wb, "andreani_pedidos.xlsx");
}
