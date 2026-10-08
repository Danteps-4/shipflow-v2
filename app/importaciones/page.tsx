"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ClipboardEvent as ReactClipboardEvent, ReactNode } from "react";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Linea {
  id: number;            // 0 = fila virtual (compra sin productos todavía)
  compra_id: number;
  sku: string;
  nombre: string;
  cantidad_esperada: number;
  cantidad_recibida: number;
  impuestos_pagados: boolean;
}

interface Compra {
  id: number;
  fecha_compra: string;           // YYYY-MM-DD
  tracking_number: string | null;
  fecha_llegada: string | null;   // YYYY-MM-DD
  dap: number | null;
  pague: number | null;
  precio_usd: number | null;
  declaro: number | null;
  impuestos: number | null;
  total_ars: number | null;
  lineas: Linea[];
}

interface StockItem { sku: string; nombre: string }

type Raw = Record<string, unknown>;

// La API devuelve NUMERIC como string y DATE como timestamp ISO — se
// normaliza todo acá una sola vez para que el resto trabaje con tipos limpios.
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toFecha(v: unknown): string | null {
  return v ? String(v).slice(0, 10) : null;
}
function normLinea(r: Raw): Linea {
  return {
    id: Number(r.id), compra_id: Number(r.compra_id),
    sku: String(r.sku ?? ""), nombre: String(r.nombre ?? ""),
    cantidad_esperada: Number(r.cantidad_esperada ?? 0), cantidad_recibida: Number(r.cantidad_recibida ?? 0),
    impuestos_pagados: Boolean(r.impuestos_pagados),
  };
}
function normCompra(r: Raw): Compra {
  return {
    id: Number(r.id),
    fecha_compra: toFecha(r.fecha_compra) ?? "",
    tracking_number: r.tracking_number ? String(r.tracking_number) : null,
    fecha_llegada: toFecha(r.fecha_llegada_estimada) ?? toFecha(r.fecha_llegada_real),
    dap: toNum(r.dap), pague: toNum(r.pague), precio_usd: toNum(r.precio_usd),
    declaro: toNum(r.declaro), impuestos: toNum(r.impuestos), total_ars: toNum(r.total_ars),
    lineas: Array.isArray(r.lineas) ? (r.lineas as Raw[]).map(normLinea) : [],
  };
}

// ─── Columnas ────────────────────────────────────────────────────────────────

type ColKey = "estado" | "fecha" | "tracking" | "cantidad" | "producto" | "dap" | "pague" | "usd" | "declaro" | "impuestos" | "total" | "llegada" | "dias";
// "linea" = una celda por producto; "compra" = combinada sobre los productos
// de la compra; "envio" = combinada sobre todas las compras del mismo tracking.
type Nivel = "linea" | "compra" | "envio";
type Tipo = "estado" | "fecha" | "texto" | "entero" | "moneda" | "calc";

interface ColDef { key: ColKey; label: string; nivel: Nivel; tipo: Tipo; width: number; align: "left" | "right" | "center" }

const COLS: ColDef[] = [
  { key: "estado",    label: "",            nivel: "linea",  tipo: "estado", width: 34,  align: "center" },
  { key: "fecha",     label: "COMPRA",      nivel: "compra", tipo: "fecha",  width: 104, align: "center" },
  { key: "tracking",  label: "SEGUIMIENTO", nivel: "envio",  tipo: "texto",  width: 128, align: "center" },
  { key: "cantidad",  label: "CANTIDAD",    nivel: "linea",  tipo: "entero", width: 86,  align: "right" },
  { key: "producto",  label: "PRODUCTO",    nivel: "linea",  tipo: "texto",  width: 180, align: "left" },
  { key: "dap",       label: "DAP $",       nivel: "compra", tipo: "moneda", width: 110, align: "right" },
  { key: "pague",     label: "PAGUÉ",       nivel: "compra", tipo: "moneda", width: 110, align: "right" },
  { key: "usd",       label: "PRECIO USD",  nivel: "compra", tipo: "moneda", width: 100, align: "right" },
  { key: "declaro",   label: "DECLARO",     nivel: "compra", tipo: "moneda", width: 100, align: "right" },
  { key: "impuestos", label: "IMPUESTOS",   nivel: "compra", tipo: "moneda", width: 126, align: "right" },
  { key: "total",     label: "TOTAL (ARS)", nivel: "compra", tipo: "moneda", width: 140, align: "right" },
  { key: "llegada",   label: "LLEGADA",     nivel: "compra", tipo: "fecha",  width: 104, align: "center" },
  { key: "dias",      label: "DÍAS",        nivel: "compra", tipo: "calc",   width: 58,  align: "center" },
];

const COL_INDEX = Object.fromEntries(COLS.map((c, i) => [c.key, i])) as Record<ColKey, number>;
const ANCHO_ACCIONES = 56;
// Con table-layout fixed el ancho total tiene que ser explícito, si no el
// navegador reparte el sobrante y estira columnas (ej. PRODUCTO).
const ANCHO_TABLA = COLS.reduce((s, c) => s + c.width, 0) + ANCHO_ACCIONES * 2;
const editable = (c: ColDef) => c.tipo !== "calc" && c.tipo !== "estado";

// ─── Estado por línea (= color de la fila del Excel) ────────────────────────

type Estado = "en_viaje" | "impuestos" | "llego";

function estadoDe(l: Linea): Estado {
  if (l.cantidad_esperada > 0 && l.cantidad_recibida >= l.cantidad_esperada) return "llego";
  if (l.impuestos_pagados) return "impuestos";
  return "en_viaje";
}

const ESTADO_INFO: Record<Estado, { label: string; bg: string; dot: string }> = {
  en_viaje:  { label: "En viaje",          bg: "rgba(234,179,8,0.18)",  dot: "#eab308" },
  impuestos: { label: "Impuestos pagados", bg: "rgba(6,182,212,0.20)",  dot: "#06b6d4" },
  llego:     { label: "Llegó",             bg: "rgba(34,197,94,0.20)",  dot: "#22c55e" },
};

// ─── Formato y parseo (escritura libre, como en el Excel) ───────────────────

function fmtFecha(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

function fmtMoneda(n: number | null, decimales = 2): string {
  if (n === null) return "";
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: 2 });
}

function numAEditar(n: number | null): string {
  return n === null ? "" : String(n).replace(".", ",");
}

// Acepta "2935", "2.935,50", "2,935.50", "$2,935.00", "1.605" (miles) o
// "2832.23" (decimal): el último separador decide, y un solo separador
// seguido de exactamente 3 dígitos se toma como separador de miles.
// undefined = no es un número válido.
function parseNumero(raw: string): number | null | undefined {
  let s = raw.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const miles = dec === "." ? "," : ".";
    s = s.split(miles).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    const despues = s.length - lastComma - 1;
    const cantidad = s.split(",").length - 1;
    s = cantidad === 1 && despues !== 3 ? s.replace(",", ".") : s.split(",").join("");
  } else if (lastDot >= 0) {
    const despues = s.length - lastDot - 1;
    const cantidad = s.split(".").length - 1;
    if (cantidad > 1 || despues === 3) s = s.split(".").join("");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// Acepta "23/9/2026", "23/9/26", "23/9" (año actual), "23-9-2026" o
// "2026-09-23". undefined = fecha inválida.
function parseFecha(raw: string): string | null | undefined {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (dmy) {
    d = +dmy[1]; m = +dmy[2];
    y = dmy[3] ? (dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3]) : new Date().getFullYear();
  } else return undefined;
  const fecha = new Date(Date.UTC(y, m - 1, d));
  if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function diasEntre(desde: string, hasta: string | null): number | null {
  if (!desde || !hasta) return null;
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
}

const normNombre = (s: string) => s.toUpperCase().replace(/\s+/g, "");

// Mismo mapa que usó el import histórico (scripts/importar-historico-
// importaciones.ts) — se usa solo si el nombre no aparece ya en compras
// anteriores ni en el Stock.
const ALIAS_BASE: Record<string, string> = {
  "ABS": "ABDOMEN",
  "ABS+BRAZOS": "ABDOMEN-BRAZOS",
  "GLUTEOS": "GLUTEOS",
  "NEGRO": "ADAPTADOR NEGRO",
  "BLANCO": "ADAPTADOR BLANCO",
};

// ─── Filas (una por producto, como en el Excel) ─────────────────────────────

interface Fila {
  compra: Compra;
  linea: Linea;
  primeraDeCompra: number;
  ultimaDeCompra: number;
  primeraDeEnvio: number;
  ultimaDeEnvio: number;
  envio: Compra[];     // todas las compras del mismo tracking
}

// Las compras con el mismo tracking se agrupan juntas (envío consolidado);
// los grupos van en orden cronológico, como el Excel (lo más nuevo abajo).
function armarFilas(compras: Compra[]): Fila[] {
  const grupos = new Map<string, Compra[]>();
  for (const c of compras) {
    const key = c.tracking_number ? `t:${c.tracking_number}` : `c:${c.id}`;
    const g = grupos.get(key);
    if (g) g.push(c); else grupos.set(key, [c]);
  }
  const orden = (a: Compra, b: Compra) => a.fecha_compra.localeCompare(b.fecha_compra) || a.id - b.id;
  const envios = Array.from(grupos.values()).map(g => g.sort(orden)).sort((a, b) => orden(a[0], b[0]));

  const filas: Fila[] = [];
  for (const envio of envios) {
    const inicioEnvio = filas.length;
    for (const compra of envio) {
      const inicioCompra = filas.length;
      const lineas = compra.lineas.length > 0
        ? [...compra.lineas].sort((a, b) => a.id - b.id)
        : [{ id: 0, compra_id: compra.id, sku: "", nombre: "", cantidad_esperada: 0, cantidad_recibida: 0, impuestos_pagados: false }];
      for (const linea of lineas) {
        filas.push({ compra, linea, primeraDeCompra: inicioCompra, ultimaDeCompra: -1, primeraDeEnvio: inicioEnvio, ultimaDeEnvio: -1, envio });
      }
      for (let i = inicioCompra; i < filas.length; i++) filas[i].ultimaDeCompra = filas.length - 1;
    }
    for (let i = inicioEnvio; i < filas.length; i++) filas[i].ultimaDeEnvio = filas.length - 1;
  }
  return filas;
}

function anclaDe(filas: Fila[], fila: number, col: number): number {
  const f = filas[fila];
  if (!f) return fila;
  const nivel = COLS[col].nivel;
  return nivel === "compra" ? f.primeraDeCompra : nivel === "envio" ? f.primeraDeEnvio : fila;
}

// ─── Página ──────────────────────────────────────────────────────────────────

interface Seleccion { fila: number; col: number }
interface SeleccionPendiente { lineaId?: number; compraId?: number; col: ColKey }

export default function ImportacionesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [sel, setSel] = useState<Seleccion | null>(null);
  const [editando, setEditando] = useState<Seleccion | null>(null);
  const [draft, setDraft] = useState("");
  const [sugIdx, setSugIdx] = useState(-1);

  const gridRef = useRef<HTMLDivElement>(null);
  const editandoRef = useRef<Seleccion | null>(null);
  // Espejo sincrónico de `draft`: al tipear rápido, el Enter puede llegar
  // antes de que React re-renderice, y el `draft` del closure quedaría viejo.
  const draftRef = useRef("");
  const pendienteRef = useRef<SeleccionPendiente | null>(null);
  const scrolledInicialRef = useRef(false);

  // ── Carga ──
  const fetchCompras = useCallback(async () => {
    try {
      const res = await fetch("/api/importaciones/compras");
      if (res.status === 401 || res.status === 403) { setErrorCarga("No tenés acceso a este módulo."); return; }
      if (!res.ok) throw new Error("Error al cargar las compras");
      const data = await res.json();
      setCompras((data.compras ?? []).map(normCompra));
      setErrorCarga(null);
    } catch (e: unknown) {
      setErrorCarga(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompras(); }, [fetchCompras]);

  useEffect(() => {
    fetch("/api/stock").then(r => (r.ok ? r.json() : null)).then(data => {
      if (data?.items) setStock(data.items.map((i: Raw) => ({ sku: String(i.sku), nombre: String(i.nombre ?? "") })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  // ── Filas visibles (con búsqueda) ──
  const comprasVisibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    if (!q) return compras;
    return compras.filter(c =>
      (c.tracking_number ?? "").toUpperCase().includes(q) ||
      c.lineas.some(l => l.nombre.toUpperCase().includes(q) || l.sku.toUpperCase().includes(q)),
    );
  }, [compras, busqueda]);

  const filas = useMemo(() => armarFilas(comprasVisibles), [comprasVisibles]);

  // ── Producto: nombres libres → SKU ──
  const stockSkus = useMemo(() => new Set(stock.map(s => s.sku.toUpperCase())), [stock]);

  // Lo que ya se escribió antes en compras anteriores manda (ej. "ALMOHADA 2"
  // → ALMOHADA-2): así el mismo nombre de siempre cae siempre en el mismo SKU.
  const aliasAprendidos = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of compras) for (const l of c.lineas) {
      if (l.nombre && l.sku) m.set(normNombre(l.nombre), l.sku);
    }
    return m;
  }, [compras]);

  const resolverProducto = useCallback((texto: string): { sku: string; nombre: string } => {
    const t = texto.trim();
    if (!t) return { sku: "", nombre: "" };
    const up = t.toUpperCase();
    if (stockSkus.has(up)) return { sku: up, nombre: t };
    const key = normNombre(t);
    const aprendido = aliasAprendidos.get(key);
    if (aprendido) return { sku: aprendido, nombre: t };
    const porNombre = stock.find(s => normNombre(s.nombre) === key);
    if (porNombre) return { sku: porNombre.sku.toUpperCase(), nombre: t };
    if (ALIAS_BASE[key]) return { sku: ALIAS_BASE[key], nombre: t };
    return { sku: up.replace(/\s+/g, "-"), nombre: t };
  }, [stockSkus, aliasAprendidos, stock]);

  const sugerencias = useMemo(() => {
    if (!editando || COLS[editando.col].key !== "producto") return [];
    const q = draft.trim().toUpperCase();
    const vistos = new Set<string>();
    const lista: { texto: string; sku: string }[] = [];
    const agregar = (texto: string, sku: string) => {
      const k = `${normNombre(texto)}|${sku}`;
      if (vistos.has(k)) return;
      vistos.add(k);
      lista.push({ texto, sku });
    };
    for (const c of compras) for (const l of c.lineas) if (l.nombre && l.sku && l.nombre.length <= 30) agregar(l.nombre, l.sku);
    for (const s of stock) agregar(s.sku, s.sku);
    return lista
      .filter(s => !q || s.texto.toUpperCase().includes(q) || s.sku.includes(q))
      .slice(0, 8);
  }, [editando, draft, compras, stock]);

  // ── Selección: scroll + selección pendiente después de crear filas ──
  useEffect(() => {
    const p = pendienteRef.current;
    if (!p) return;
    const fila = filas.findIndex(f => (p.lineaId !== undefined ? f.linea.id === p.lineaId : f.compra.id === p.compraId));
    if (fila >= 0) {
      pendienteRef.current = null;
      setSel({ fila: anclaDe(filas, fila, COL_INDEX[p.col]), col: COL_INDEX[p.col] });
      gridRef.current?.focus();
    }
  }, [filas]);

  useEffect(() => {
    if (!sel) return;
    const el = gridRef.current?.querySelector(`[data-cell="${sel.fila}-${sel.col}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel]);

  // Arranca abajo de todo, como al abrir el Excel en la última compra.
  useEffect(() => {
    if (scrolledInicialRef.current || filas.length === 0 || !gridRef.current) return;
    scrolledInicialRef.current = true;
    gridRef.current.scrollTop = gridRef.current.scrollHeight;
  }, [filas]);

  // ── Valores de celda ──
  function valorParaEditar(f: Fila, col: ColDef): string {
    const c = f.compra, l = f.linea;
    switch (col.key) {
      case "fecha":     return fmtFecha(c.fecha_compra);
      case "tracking":  return c.tracking_number ?? "";
      case "cantidad":  return l.cantidad_esperada ? String(l.cantidad_esperada) : "";
      case "producto":  return l.nombre || l.sku;
      case "dap":       return numAEditar(c.dap);
      case "pague":     return numAEditar(c.pague);
      case "usd":       return numAEditar(c.precio_usd);
      case "declaro":   return numAEditar(c.declaro);
      case "impuestos": return numAEditar(c.impuestos);
      case "total":     return numAEditar(c.total_ars);
      case "llegada":   return fmtFecha(c.fecha_llegada);
      default:          return "";
    }
  }

  function totalSegunFormula(c: Compra): number | null {
    if (c.precio_usd === null || c.pague === null) return null;
    return (c.impuestos ?? 0) + c.precio_usd * c.pague;
  }

  // Chequeos en vivo — "error" se pinta en rojo, "aviso" en ámbar.
  function problemaDe(f: Fila, col: ColDef): { nivel: "error" | "aviso"; texto: string } | null {
    const c = f.compra, l = f.linea;
    switch (col.key) {
      case "producto":
        if (!l.sku) return { nivel: "error", texto: "Falta el producto" };
        if (stockSkus.size > 0 && !stockSkus.has(l.sku.toUpperCase())) {
          return { nivel: "aviso", texto: `"${l.sku}" no existe en Stock — se va a crear cuando se reciba` };
        }
        return null;
      case "cantidad":
        return l.cantidad_esperada <= 0 ? { nivel: "error", texto: "Falta la cantidad" } : null;
      case "total": {
        const esperado = totalSegunFormula(c);
        if (c.total_ars === null || esperado === null) return null;
        return Math.abs(c.total_ars - esperado) > 1
          ? { nivel: "aviso", texto: `No coincide con IMPUESTOS + PRECIO USD × PAGUÉ = ${fmtMoneda(esperado)}` }
          : null;
      }
      case "llegada": {
        const dias = diasEntre(c.fecha_compra, c.fecha_llegada);
        return dias !== null && dias < 0 ? { nivel: "aviso", texto: "La llegada es anterior a la fecha de compra" } : null;
      }
      default:
        return null;
    }
  }

  function contenidoDe(f: Fila, col: ColDef): ReactNode {
    const c = f.compra, l = f.linea;
    switch (col.key) {
      case "estado": {
        const e = ESTADO_INFO[estadoDe(l)];
        return <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: "50%", background: e.dot, boxShadow: "0 0 0 2px rgba(0,0,0,0.25)" }} />;
      }
      case "fecha":     return fmtFecha(c.fecha_compra);
      case "tracking":  return c.tracking_number ?? "";
      case "cantidad":  return l.cantidad_esperada ? l.cantidad_esperada : "";
      case "producto": {
        const texto = l.nombre || l.sku;
        const muestraSku = l.sku && normNombre(l.nombre) !== normNombre(l.sku);
        return (
          <>
            {texto}
            {muestraSku && <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: "0.4rem", fontFamily: "monospace" }}>{l.sku}</span>}
          </>
        );
      }
      case "dap":       return fmtMoneda(c.dap);
      case "pague":     return fmtMoneda(c.pague);
      case "usd":       return fmtMoneda(c.precio_usd, 0);
      case "declaro":   return fmtMoneda(c.declaro);
      case "impuestos": return fmtMoneda(c.impuestos);
      case "total":     return fmtMoneda(c.total_ars);
      case "llegada":   return fmtFecha(c.fecha_llegada);
      case "dias":      return diasEntre(c.fecha_compra, c.fecha_llegada) ?? "";
    }
  }

  // ── Guardado (optimista: se ve al instante, se guarda por atrás) ──
  async function llamar(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
    return data;
  }

  function actualizarCompraLocal(id: number, cambio: Partial<Compra>) {
    setCompras(prev => prev.map(c => (c.id === id ? { ...c, ...cambio } : c)));
  }

  function actualizarLineaLocal(compraId: number, lineaId: number, cambio: Partial<Linea>) {
    setCompras(prev => prev.map(c => c.id !== compraId ? c : {
      ...c, lineas: c.lineas.map(l => (l.id === lineaId ? { ...l, ...cambio } : l)),
    }));
  }

  async function guardar(promesa: Promise<unknown>) {
    try {
      await promesa;
    } catch (e: unknown) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar");
      fetchCompras();
    }
  }

  async function guardarLinea(f: Fila, cambio: { sku?: string; nombre?: string; cantidadEsperada?: number; impuestosPagados?: boolean }) {
    const local: Partial<Linea> = {};
    if (cambio.sku !== undefined) local.sku = cambio.sku;
    if (cambio.nombre !== undefined) local.nombre = cambio.nombre;
    if (cambio.cantidadEsperada !== undefined) local.cantidad_esperada = cambio.cantidadEsperada;
    if (cambio.impuestosPagados !== undefined) local.impuestos_pagados = cambio.impuestosPagados;

    // Fila virtual (compra sin productos): la primera edición crea el producto.
    if (f.linea.id === 0) {
      try {
        const data = await llamar(`/api/importaciones/compras/${f.compra.id}/lineas`, "POST", cambio);
        const nueva = normLinea(data.linea);
        setCompras(prev => prev.map(c => (c.id === f.compra.id ? { ...c, lineas: [...c.lineas, nueva] } : c)));
      } catch (e: unknown) {
        setAviso(e instanceof Error ? e.message : "No se pudo guardar");
      }
      return;
    }
    actualizarLineaLocal(f.compra.id, f.linea.id, local);
    await guardar(llamar(`/api/importaciones/lineas/${f.linea.id}`, "PATCH", cambio));
  }

  async function confirmarValor(f: Fila, col: ColDef, texto: string) {
    const c = f.compra;
    const anterior = valorParaEditar(f, col);
    if (texto.trim() === anterior.trim()) return;

    switch (col.key) {
      case "fecha":
      case "llegada": {
        const fecha = parseFecha(texto);
        if (fecha === undefined) { setAviso(`Fecha inválida en ${col.label}: "${texto}". Usá por ejemplo 23/9/2026.`); return; }
        if (col.key === "fecha") {
          if (!fecha) { setAviso("La fecha de compra no puede quedar vacía"); return; }
          actualizarCompraLocal(c.id, { fecha_compra: fecha });
          await guardar(llamar(`/api/importaciones/compras/${c.id}`, "PATCH", { fechaCompra: fecha }));
        } else {
          actualizarCompraLocal(c.id, { fecha_llegada: fecha });
          await guardar(llamar(`/api/importaciones/compras/${c.id}`, "PATCH", { fechaLlegadaEstimada: fecha }));
        }
        return;
      }
      case "tracking": {
        // Celda combinada: renombra el tracking de todas las compras del envío.
        const tracking = texto.trim().replace(/\s+/g, "") || null;
        const ids = f.envio.map(x => x.id);
        setCompras(prev => prev.map(x => (ids.includes(x.id) ? { ...x, tracking_number: tracking } : x)));
        await guardar(Promise.all(ids.map(id => llamar(`/api/importaciones/compras/${id}`, "PATCH", { trackingNumber: tracking }))));
        return;
      }
      case "dap": case "pague": case "usd": case "declaro": case "impuestos": case "total": {
        const n = parseNumero(texto);
        if (n === undefined) { setAviso(`Número inválido en ${col.label}: "${texto}"`); return; }
        const campoLocal = { dap: "dap", pague: "pague", usd: "precio_usd", declaro: "declaro", impuestos: "impuestos", total: "total_ars" }[col.key] as keyof Compra;
        const campoApi = { dap: "dap", pague: "pague", usd: "precioUsd", declaro: "declaro", impuestos: "impuestos", total: "totalArs" }[col.key];
        actualizarCompraLocal(c.id, { [campoLocal]: n } as Partial<Compra>);
        await guardar(llamar(`/api/importaciones/compras/${c.id}`, "PATCH", { [campoApi]: n }));
        return;
      }
      case "cantidad": {
        const n = parseNumero(texto);
        if (n === undefined || (n !== null && (!Number.isInteger(n) || n < 0))) {
          setAviso(`La cantidad tiene que ser un número entero: "${texto}"`); return;
        }
        await guardarLinea(f, { cantidadEsperada: n ?? 0 });
        return;
      }
      case "producto": {
        const { sku, nombre } = resolverProducto(texto);
        await guardarLinea(f, { sku, nombre });
        return;
      }
    }
  }

  async function toggleImpuestos(f: Fila) {
    if (estadoDe(f.linea) === "llego") {
      setAviso(`Ya llegó (recibido ${f.linea.cantidad_recibida}/${f.linea.cantidad_esperada}) — el verde lo pone el escaneo en Recepción.`);
      return;
    }
    await guardarLinea(f, { impuestosPagados: !f.linea.impuestos_pagados });
  }

  // ── Edición ──
  function cambiarDraft(valor: string) {
    draftRef.current = valor;
    setDraft(valor);
  }

  function empezarEdicion(s: Seleccion, valorInicial?: string) {
    const col = COLS[s.col];
    if (!editable(col)) return;
    const f = filas[s.fila];
    if (!f) return;
    editandoRef.current = s;
    setEditando(s);
    cambiarDraft(valorInicial ?? valorParaEditar(f, col));
    setSugIdx(-1);
  }

  // refocus = false cuando se sale de la celda por un click afuera de la
  // grilla (ej. el buscador): no hay que robarle el foco a lo que se clickeó.
  function terminarEdicion(confirmar: boolean, mover?: { dFila: number; dCol: number }, valor?: string, refocus = true) {
    const s = editandoRef.current;
    if (!s) return;
    editandoRef.current = null;
    setEditando(null);
    const f = filas[s.fila];
    if (confirmar && f) confirmarValor(f, COLS[s.col], valor ?? draftRef.current);
    if (mover) moverDesde(s, mover.dFila, mover.dCol);
    if (refocus) gridRef.current?.focus();
  }

  function moverDesde(desde: Seleccion, dFila: number, dCol: number) {
    if (filas.length === 0) return;
    const col = Math.max(0, Math.min(COLS.length - 1, desde.col + dCol));
    let fila = desde.fila;
    if (dFila !== 0) {
      const f = filas[fila];
      const nivel = COLS[col].nivel;
      if (dFila > 0) fila = nivel === "linea" ? fila + 1 : nivel === "compra" ? f.ultimaDeCompra + 1 : f.ultimaDeEnvio + 1;
      else fila = nivel === "linea" ? fila - 1 : nivel === "compra" ? f.primeraDeCompra - 1 : f.primeraDeEnvio - 1;
      fila = Math.max(0, Math.min(filas.length - 1, fila));
    }
    setSel({ fila: anclaDe(filas, fila, col), col });
  }

  function onGridKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // Ya se pidió editar pero el input todavía no tomó el foco (tipeo
    // rápido): las teclas llegan acá en vez de al input. Se las pasa al
    // editor en vez de perderlas.
    if (editandoRef.current) {
      manejarTeclaEdicion(e);
      if (!e.defaultPrevented && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        cambiarDraft(draftRef.current + e.key);
      } else if (!e.defaultPrevented && e.key === "Backspace") {
        e.preventDefault();
        cambiarDraft(draftRef.current.slice(0, -1));
      }
      return;
    }
    if (!sel) return;
    const f = filas[sel.fila];
    const col = COLS[sel.col];
    if (!f) return;
    const k = e.key;

    if (k === "ArrowDown") { e.preventDefault(); moverDesde(sel, 1, 0); return; }
    if (k === "ArrowUp") { e.preventDefault(); moverDesde(sel, -1, 0); return; }
    if (k === "ArrowRight") { e.preventDefault(); moverDesde(sel, 0, 1); return; }
    if (k === "ArrowLeft") { e.preventDefault(); moverDesde(sel, 0, -1); return; }
    if (k === "Tab") { e.preventDefault(); moverDesde(sel, 0, e.shiftKey ? -1 : 1); return; }

    if (col.tipo === "estado") {
      if (k === "Enter" || k === " ") { e.preventDefault(); toggleImpuestos(f); }
      return;
    }
    if (k === "Enter" || k === "F2") { e.preventDefault(); empezarEdicion(sel); return; }
    if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      if (editable(col) && col.key !== "fecha") confirmarValor(f, col, "");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "c") {
      navigator.clipboard?.writeText(valorParaEditar(f, col)).catch(() => {});
      return;
    }
    // Escribir encima de una celda la reemplaza, como en Excel.
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      empezarEdicion(sel, k);
    }
  }

  function onGridPaste(e: ReactClipboardEvent<HTMLDivElement>) {
    if (editandoRef.current || !sel) return;
    const texto = e.clipboardData.getData("text/plain");
    const partes = texto.replace(/\r?\n$/, "").split(/\t|\r?\n/);
    e.preventDefault();
    if (partes.length > 1) {
      setAviso("Por ahora se pega de a una celda por vez.");
      return;
    }
    const f = filas[sel.fila];
    const col = COLS[sel.col];
    if (f && editable(col)) confirmarValor(f, col, texto.trim());
  }

  function onEditorKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    // Sin esto, el Enter que confirma la celda burbujea a la grilla (que para
    // ese momento ya no está en modo edición) y abre la celda de abajo.
    e.stopPropagation();
    manejarTeclaEdicion(e);
  }

  // Teclas especiales durante la edición (Enter/Tab/Esc y flechas de las
  // sugerencias de producto), vengan del input o de la grilla.
  function manejarTeclaEdicion(e: ReactKeyboardEvent<HTMLElement>) {
    const s = editandoRef.current;
    const esProducto = s !== null && COLS[s.col].key === "producto";
    if (esProducto && sugerencias.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setSugIdx(i => {
        const n = sugerencias.length;
        return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const elegida = esProducto && sugIdx >= 0 ? sugerencias[sugIdx]?.texto : undefined;
      terminarEdicion(true, { dFila: 1, dCol: 0 }, elegida);
    } else if (e.key === "Tab") {
      e.preventDefault();
      terminarEdicion(true, { dFila: 0, dCol: e.shiftKey ? -1 : 1 });
    } else if (e.key === "Escape") {
      e.preventDefault();
      terminarEdicion(false);
    }
  }

  // ── Filas: agregar / borrar ──
  async function nuevaCompra() {
    try {
      const hoy = new Date();
      const fechaCompra = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
      const data = await llamar("/api/importaciones/compras", "POST", { fechaCompra });
      const compra = normCompra(data.compra);
      setBusqueda("");
      pendienteRef.current = { compraId: compra.id, col: "cantidad" };
      setCompras(prev => [...prev, compra]);
    } catch (e: unknown) {
      setAviso(e instanceof Error ? e.message : "No se pudo crear la compra");
    }
  }

  async function agregarProducto(f: Fila) {
    try {
      const data = await llamar(`/api/importaciones/compras/${f.compra.id}/lineas`, "POST", {});
      const linea = normLinea(data.linea);
      pendienteRef.current = { lineaId: linea.id, col: "cantidad" };
      setCompras(prev => prev.map(c => (c.id === f.compra.id ? { ...c, lineas: [...c.lineas, linea] } : c)));
    } catch (e: unknown) {
      setAviso(e instanceof Error ? e.message : "No se pudo agregar el producto");
    }
  }

  async function borrarProducto(f: Fila) {
    if (f.linea.id === 0) return;
    if (!confirm(`¿Borrar "${f.linea.nombre || f.linea.sku || "este producto"}" de la compra del ${fmtFecha(f.compra.fecha_compra)}?`)) return;
    try {
      await llamar(`/api/importaciones/lineas/${f.linea.id}`, "DELETE");
      setCompras(prev => prev.map(c => (c.id === f.compra.id ? { ...c, lineas: c.lineas.filter(l => l.id !== f.linea.id) } : c)));
      setSel(null);
    } catch (e: unknown) {
      setAviso(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  async function borrarCompra(f: Fila) {
    if (!confirm(`¿Borrar la compra del ${fmtFecha(f.compra.fecha_compra)} con todos sus productos? No se puede deshacer.`)) return;
    try {
      await llamar(`/api/importaciones/compras/${f.compra.id}`, "DELETE");
      setCompras(prev => prev.filter(c => c.id !== f.compra.id));
      setSel(null);
    } catch (e: unknown) {
      setAviso(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  async function sacarDelEnvio(f: Fila) {
    if (!confirm(`¿Sacar la compra del ${fmtFecha(f.compra.fecha_compra)} del envío ${f.compra.tracking_number}? Queda sin tracking.`)) return;
    actualizarCompraLocal(f.compra.id, { tracking_number: null });
    await guardar(llamar(`/api/importaciones/compras/${f.compra.id}`, "PATCH", { trackingNumber: null }));
  }

  // ── Resumen ──
  const resumen = useMemo(() => {
    const r: Record<Estado, number> = { en_viaje: 0, impuestos: 0, llego: 0 };
    for (const c of compras) for (const l of c.lineas) r[estadoDe(l)] += 1;
    return r;
  }, [compras]);

  // ── Render ──
  const celdaBase: CSSProperties = {
    border: "1px solid var(--border-color)", padding: "0 6px", height: 30,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    position: "relative", cursor: "cell", fontSize: "0.82rem",
  };

  function renderCelda(f: Fila, i: number, colIdx: number) {
    const col = COLS[colIdx];
    if (col.nivel === "compra" && i !== f.primeraDeCompra) return null;
    if (col.nivel === "envio" && i !== f.primeraDeEnvio) return null;

    const rowSpan = col.nivel === "compra" ? f.ultimaDeCompra - f.primeraDeCompra + 1
      : col.nivel === "envio" ? f.ultimaDeEnvio - f.primeraDeEnvio + 1 : 1;
    // Las celdas combinadas toman el color de su primer producto, como en el Excel.
    const lineaColor = col.nivel === "linea" ? f.linea
      : col.nivel === "compra" ? filas[f.primeraDeCompra].linea : filas[f.primeraDeEnvio].linea;
    const bg = ESTADO_INFO[estadoDe(lineaColor)].bg;

    const seleccionada = sel !== null && sel.col === colIdx && anclaDe(filas, sel.fila, colIdx) === i;
    const enEdicion = editando !== null && editando.col === colIdx && anclaDe(filas, editando.fila, colIdx) === i;
    const problema = problemaDe(f, col);

    const style: CSSProperties = {
      ...celdaBase, textAlign: col.align, background: bg,
      fontWeight: col.key === "total" ? 700 : col.key === "tracking" ? 600 : undefined,
      fontFamily: col.key === "tracking" ? "monospace" : undefined,
      boxShadow: seleccionada
        ? "inset 0 0 0 2px var(--primary-color)"
        : problema ? `inset 0 0 0 2px ${problema.nivel === "error" ? "rgba(239,68,68,0.85)" : "rgba(245,158,11,0.75)"}` : undefined,
    };

    let titulo: string | undefined = problema?.texto;
    if (col.key === "estado") {
      const e = estadoDe(f.linea);
      titulo = `${ESTADO_INFO[e].label} — recibido ${f.linea.cantidad_recibida}/${f.linea.cantidad_esperada}` +
        (e === "llego" ? "" : ". Click para marcar/desmarcar impuestos pagados.");
    }

    return (
      <td
        key={col.key}
        rowSpan={rowSpan}
        data-cell={`${i}-${colIdx}`}
        style={style}
        title={titulo}
        onMouseDown={(ev) => {
          if (enEdicion) return;
          ev.preventDefault();
          if (editandoRef.current) terminarEdicion(true);
          setSel({ fila: i, col: colIdx });
          gridRef.current?.focus();
        }}
        onClick={() => { if (col.tipo === "estado") toggleImpuestos(f); }}
        onDoubleClick={() => empezarEdicion({ fila: i, col: colIdx })}
      >
        {enEdicion ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={ev => { cambiarDraft(ev.target.value); setSugIdx(-1); }}
              onKeyDown={onEditorKeyDown}
              onBlur={() => terminarEdicion(true, undefined, undefined, false)}
              onFocus={ev => { const n = ev.target.value.length; ev.target.setSelectionRange(n, n); }}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%", border: "2px solid var(--primary-color)",
                background: "var(--surface-color)", color: "var(--text-color)", padding: "0 5px",
                fontSize: "0.82rem", textAlign: col.align, outline: "none", boxSizing: "border-box",
              }}
            />
            {col.key === "producto" && sugerencias.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, minWidth: 260, zIndex: 50,
                background: "var(--surface-color)", border: "1px solid var(--border-color)",
                borderRadius: "var(--radius)", boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
              }}>
                {sugerencias.map((s, idx) => (
                  <div
                    key={`${s.texto}|${s.sku}`}
                    onMouseDown={ev => { ev.preventDefault(); terminarEdicion(true, undefined, s.texto); }}
                    style={{
                      padding: "0.35rem 0.6rem", cursor: "pointer", fontSize: "0.8rem", display: "flex", gap: "0.5rem",
                      background: idx === sugIdx ? "rgba(59,130,246,0.18)" : "transparent",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{s.texto}</span>
                    {normNombre(s.texto) !== normNombre(s.sku) && (
                      <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.72rem" }}>{s.sku}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {contenidoDe(f, col)}
            {problema && (
              <i
                className="fas fa-triangle-exclamation"
                style={{ position: "absolute", top: 2, right: 3, fontSize: "0.6rem", color: problema.nivel === "error" ? "#ef4444" : "#f59e0b" }}
              />
            )}
          </>
        )}
      </td>
    );
  }

  const botonIcono: CSSProperties = {
    background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
    padding: "0.15rem 0.3rem", fontSize: "0.75rem",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <UserMenu />
        </div>
      </header>

      <main className="sf-main" style={{ maxWidth: 1800 }}>
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Compras a China</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.88rem" }}>
            Escribí directo en las celdas como en el Excel: Enter o doble click para editar, flechas/Tab para moverte, Esc para cancelar.
            Las compras con el mismo seguimiento se agrupan solas. La recepción física se confirma en{" "}
            <a href="/importaciones/recepcion" style={{ color: "var(--primary-color)" }}>Recepción (Escaneo)</a>.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.75rem" }}>
            <input
              className="sf-input" style={{ maxWidth: 240 }} placeholder="Buscar seguimiento o producto..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
            />
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {(Object.keys(ESTADO_INFO) as Estado[]).map(k => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: ESTADO_INFO[k].dot, display: "inline-block" }} />
                  {ESTADO_INFO[k].label}: <strong style={{ color: "var(--text-color)" }}>{resumen[k]}</strong>
                </span>
              ))}
            </div>
            <button className="sf-btn" style={{ marginLeft: "auto" }} onClick={nuevaCompra}>
              <i className="fas fa-plus" /> Nueva compra
            </button>
          </div>

          {aviso && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "0.75rem" }}>
              <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
              <span>{aviso}</span>
            </div>
          )}

          {errorCarga ? (
            <div className="sf-alert sf-alert-warning"><i className="fas fa-circle-exclamation" /><span>{errorCarga}</span></div>
          ) : loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.5rem" }} />Cargando...
            </div>
          ) : (
            <div
              ref={gridRef}
              tabIndex={0}
              onKeyDown={onGridKeyDown}
              onPaste={onGridPaste}
              style={{
                maxHeight: "calc(100vh - 270px)", overflow: "auto", outline: "none",
                border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
              }}
            >
              <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: ANCHO_TABLA }}>
                <colgroup>
                  {COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
                  <col style={{ width: ANCHO_ACCIONES }} />
                  <col style={{ width: ANCHO_ACCIONES }} />
                </colgroup>
                <thead>
                  <tr>
                    {COLS.map(c => (
                      <th key={c.key} style={{
                        position: "sticky", top: 0, zIndex: 5, background: "var(--surface-color)",
                        border: "1px solid var(--border-color)", padding: "0.45rem 6px",
                        fontSize: "0.75rem", fontWeight: 800, textAlign: "center", letterSpacing: "0.3px",
                      }}>
                        {c.label}
                      </th>
                    ))}
                    <th style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--surface-color)", border: "1px solid var(--border-color)", fontSize: "0.65rem", color: "var(--text-muted)" }}>Prod.</th>
                    <th style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--surface-color)", border: "1px solid var(--border-color)", fontSize: "0.65rem", color: "var(--text-muted)" }}>Compra</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 ? (
                    <tr>
                      <td colSpan={COLS.length + 2} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                        {busqueda ? "No hay compras que coincidan con la búsqueda." : "Todavía no hay compras. Agregá la primera con \"Nueva compra\"."}
                      </td>
                    </tr>
                  ) : filas.map((f, i) => (
                    <tr key={`${f.compra.id}-${f.linea.id}`}>
                      {COLS.map((_, colIdx) => renderCelda(f, i, colIdx))}
                      <td style={{ ...celdaBase, cursor: "default", textAlign: "center", padding: 0 }}>
                        <button style={botonIcono} title="Agregar otro producto a esta compra" onClick={() => agregarProducto(f)}>
                          <i className="fas fa-plus" />
                        </button>
                        {f.linea.id !== 0 && f.compra.lineas.length > 1 && (
                          <button style={botonIcono} title="Borrar este producto" onClick={() => borrarProducto(f)}>
                            <i className="fas fa-minus" />
                          </button>
                        )}
                      </td>
                      {i === f.primeraDeCompra && (
                        <td rowSpan={f.ultimaDeCompra - f.primeraDeCompra + 1} style={{ ...celdaBase, cursor: "default", textAlign: "center", padding: 0 }}>
                          {f.envio.length > 1 && (
                            <button style={botonIcono} title="Sacar esta compra del envío (queda sin seguimiento)" onClick={() => sacarDelEnvio(f)}>
                              <i className="fas fa-link-slash" />
                            </button>
                          )}
                          <button style={botonIcono} title="Borrar la compra entera" onClick={() => borrarCompra(f)}>
                            <i className="fas fa-trash" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>
    </div>
  );
}
