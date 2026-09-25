// Carga única del histórico de IMPORTACIONES.xlsx (hoja "NUVEO") a las tablas
// nuevas de lib/importacionesDb.ts. NO es parte de la app — se corre a mano
// una sola vez:
//
//   DATABASE_URL=... npx tsx scripts/importar-historico-importaciones.ts [ruta.xlsx]          (dry-run, no escribe nada)
//   DATABASE_URL=... npx tsx scripts/importar-historico-importaciones.ts [ruta.xlsx] --confirmar  (recién ahí escribe)
//
// Por defecto es dry-run a propósito (store_id real, ver incidente de esta
// misma sesión): solo agrupa/parsea el Excel e imprime qué haría, sin tocar
// la base, hasta que se pase --confirmar explícitamente.
//
// Deliberadamente NO importa nada de lib/stockDb.ts: casi todas las filas del
// Excel ya llegaron físicamente y esas unidades ya están reflejadas en el
// stock real de hoy — este script solo carga el registro (ledger), nunca
// suma/resta stock ni escribe en `movimientos`.

import * as XLSX from "xlsx";
import { getDb } from "../lib/db";
import { initImportacionesTables } from "../lib/importacionesDb";

const STORE_ID = "6524145"; // única tienda real con estos productos hoy
const CREATED_BY = "danteaugsburger4@gmail.com";
const SHEET_NAME = "NUVEO";
const DEFAULT_PATH = "C:\\Users\\Usuario\\Desktop\\IMPORTACIONES.xlsx";

// Nombre de PRODUCTO tal como aparece en el Excel → SKU real confirmado en
// la base (ver lib/stockDb.ts / tabla `stock`, store_id 6524145).
const SKU_MAP: Record<string, string> = {
  "ABS": "ABDOMEN",
  "ABS + BRAZOS": "ABDOMEN-BRAZOS",
  "GLUTEOS": "GLUTEOS",
  "ALMOHADA": "ALMOHADA",
  "MASAJEADOR": "MASAJEADOR",
  // Mismo nombre (con espacio, no guion) que ya usa la tienda "Lumeo"
  // (store_id 6590142) para el mismo producto físico, por consistencia.
  "NEGRO": "ADAPTADOR NEGRO",
  "BLANCO": "ADAPTADOR BLANCO",
};

function slugSku(nombre: string): string {
  return nombre.trim().toUpperCase().replace(/\s+/g, "-");
}

function resolverSku(producto: string): string {
  return SKU_MAP[producto] ?? slugSku(producto);
}

interface FilaExcel {
  compra: Date | null;
  seguimiento: string | null;
  cantidad: number | null;
  producto: string | null;
  dap: number | null;
  pague: number | null;
  precioUsd: number | null;
  declaro: number | null;
  impuestos: number | null;
  totalArs: number | null;
  llegada: Date | null;
}

interface GrupoCompra {
  fechaCompra: Date;
  // Nullable: confirmado contra el Excel real, 10 compras (las más chicas/
  // recientes) no tienen tracking asignado todavía — no son continuación de
  // la fila anterior (tienen su propia fecha_compra/costos/llegada), así que
  // arman su propio grupo igual, solo que sin tracking.
  trackingNumber: string | null;
  dap: number | null; pague: number | null; precioUsd: number | null;
  declaro: number | null; impuestos: number | null; totalArs: number | null;
  fechaLlegada: Date | null;
  lineas: { producto: string; cantidad: number }[];
}

function toFechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function main() {
  const posicionales = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const filePath = posicionales[0] ?? DEFAULT_PATH;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`No se encontró la hoja "${SHEET_NAME}" en ${filePath}`);

  const raw = XLSX.utils.sheet_to_json<(Date | number | string | null)[]>(ws, { header: 1, raw: true });
  // SheetJS no incluye la fila 1 (vacía) como índice aparte: raw[0] ya es la
  // fila de encabezados, los datos arrancan en raw[1] — verificado leyendo
  // las primeras filas crudas antes de asumir el offset.
  const filas: FilaExcel[] = raw.slice(1).map(r => ({
    compra: (r[1] as Date) ?? null,
    seguimiento: r[2] != null ? String(r[2]) : null,
    cantidad: typeof r[3] === "number" ? r[3] : null,
    producto: r[4] != null ? String(r[4]).trim() : null,
    dap: typeof r[5] === "number" ? r[5] : null,
    pague: typeof r[6] === "number" ? r[6] : null,
    precioUsd: typeof r[7] === "number" ? r[7] : null,
    declaro: typeof r[8] === "number" ? r[8] : null,
    impuestos: typeof r[9] === "number" ? r[9] : null,
    totalArs: typeof r[10] === "number" ? r[10] : null,
    llegada: (r[11] as Date) ?? null,
  })).filter(f => f.producto && f.cantidad);

  // Agrupa: una fila con "compra" (fecha de compra propia) es cabecera de
  // una compra NUEVA, tenga o no tracking — confirmado contra el Excel real
  // que hay compras sin tracking (ver comentario en GrupoCompra) que igual
  // arman su propio grupo, no son continuación de la anterior. Una fila SIN
  // fecha de compra propia (ni tracking) es continuación de la última
  // compra abierta — ese es el único caso real de "línea de producto extra
  // de la misma compra" (ej. "ABS" + "ABS + BRAZOS" bajo el mismo envío).
  const grupos: GrupoCompra[] = [];
  const sinAsignar: FilaExcel[] = [];
  let actual: GrupoCompra | null = null;
  for (const f of filas) {
    if (f.compra) {
      actual = {
        fechaCompra: f.compra, trackingNumber: f.seguimiento,
        dap: f.dap, pague: f.pague, precioUsd: f.precioUsd,
        declaro: f.declaro, impuestos: f.impuestos, totalArs: f.totalArs,
        fechaLlegada: f.llegada, lineas: [],
      };
      grupos.push(actual);
      actual.lineas.push({ producto: f.producto!, cantidad: f.cantidad! });
    } else if (actual) {
      actual.lineas.push({ producto: f.producto!, cantidad: f.cantidad! });
    } else {
      sinAsignar.push(f);
    }
  }

  console.log(`Compras agrupadas: ${grupos.length}`);
  console.log(`Filas sin compra asociada (sin tracking, para cargar a mano si hace falta): ${sinAsignar.length}`);
  for (const f of sinAsignar) console.log(`  - ${f.producto} × ${f.cantidad}`);

  // Sanity check: ninguna fila del Excel debería perderse ni contarse dos
  // veces al agrupar — la cantidad de líneas y la suma de unidades antes y
  // después de agrupar tienen que coincidir exactamente.
  const lineasTotales = grupos.reduce((s, g) => s + g.lineas.length, 0) + sinAsignar.length;
  const unidadesTotales = grupos.reduce((s, g) => s + g.lineas.reduce((s2, l) => s2 + l.cantidad, 0), 0)
    + sinAsignar.reduce((s, f) => s + (f.cantidad ?? 0), 0);
  console.log(`Verificación: ${lineasTotales} líneas / ${unidadesTotales} unidades totales procesadas (de ${filas.length} filas leídas del Excel).`);
  if (lineasTotales !== filas.length) {
    console.warn(`⚠ ADVERTENCIA: se procesaron ${lineasTotales} líneas pero el Excel tiene ${filas.length} filas con datos — revisar antes de confirmar.`);
  }

  const sinTrackingCount = grupos.filter(g => !g.trackingNumber).length;
  console.log(`Compras sin tracking (quedan sin poder escanearse en Recepción, solo registro): ${sinTrackingCount}`);

  const confirmar = process.argv.includes("--confirmar");
  if (!confirmar) {
    console.log(`\n[DRY-RUN] No se escribió nada en la base. Primeras 5 compras que se cargarían:`);
    for (const g of grupos.slice(0, 5)) {
      console.log(`  ${toFechaISO(g.fechaCompra)} · tracking ${g.trackingNumber ?? "(sin tracking)"} · ${g.lineas.length} línea(s): ${g.lineas.map(l => `${resolverSku(l.producto)}×${l.cantidad}`).join(", ")}`);
    }
    console.log(`\nPara escribir de verdad, volvé a correr agregando --confirmar al final.`);
    console.log(`Nota: las compras sin tracking no tienen clave de deduplicación — si este script se corre dos veces con --confirmar, se duplicarían. Correrlo una sola vez.`);
    return;
  }

  run(grupos);
}

async function run(grupos: GrupoCompra[]) {
  await initImportacionesTables();
  const sql = getDb();

  let insertadas = 0, salteadas = 0;
  const skusVistos = new Set<string>();

  for (const g of grupos) {
    const compraRows = await sql`
      INSERT INTO compras_importacion (
        store_id, fecha_compra, tracking_number, fecha_llegada_estimada, fecha_llegada_real,
        dap, pague, precio_usd, declaro, impuestos, total_ars, created_by
      ) VALUES (
        ${STORE_ID}, ${toFechaISO(g.fechaCompra)}::date, ${g.trackingNumber},
        ${g.fechaLlegada ? toFechaISO(g.fechaLlegada) : null}::date,
        ${g.fechaLlegada ? toFechaISO(g.fechaLlegada) : null}::date,
        ${g.dap}, ${g.pague}, ${g.precioUsd}, ${g.declaro}, ${g.impuestos}, ${g.totalArs}, ${CREATED_BY}
      )
      ON CONFLICT (tracking_number) DO NOTHING
      RETURNING id
    ` as { id: number }[];

    if (!compraRows[0]) { salteadas++; continue; }
    const compraId = compraRows[0].id;
    const yaLlego = !!g.fechaLlegada;

    for (const linea of g.lineas) {
      const sku = resolverSku(linea.producto);
      skusVistos.add(sku);
      const cantidadRecibida = yaLlego ? linea.cantidad : 0;
      await sql`
        INSERT INTO compras_importacion_lineas (compra_id, sku, nombre, cantidad_esperada, cantidad_recibida)
        VALUES (${compraId}, ${sku}, ${linea.producto}, ${linea.cantidad}, ${cantidadRecibida})
      `;
    }
    insertadas++;
  }

  console.log(`\nCompras insertadas: ${insertadas}`);
  console.log(`Compras salteadas (tracking ya existía): ${salteadas}`);

  const stockExistente = await sql`SELECT sku FROM stock WHERE store_id = ${STORE_ID}` as { sku: string }[];
  const skusReales = new Set(stockExistente.map(s => s.sku));
  const faltantes = [...skusVistos].filter(s => !skusReales.has(s));
  if (faltantes.length > 0) {
    console.log(`\nSKUs vistos en el Excel que todavía NO existen en /stock (creálos a mano si hace falta):`);
    for (const s of faltantes) console.log(`  - ${s}`);
  } else {
    console.log(`\nTodos los SKUs vistos ya existen en /stock.`);
  }
}

main();
