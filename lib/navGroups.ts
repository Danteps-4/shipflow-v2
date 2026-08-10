import { ModuleKey } from "./modules";

// Acciones de escritura granulares dentro de un sub apartado (además de
// "verlo o no", que ya cubre linkAccess). Hoy solo se usan en los tabs de
// Creativo que representan una biblioteca de entradas (no en Publicidad,
// que no tiene un esquema crear/editar/borrar sino pausar/reactivar).
export type LinkAction = "agregar" | "editar" | "eliminar";
export const LINK_ACTIONS: LinkAction[] = ["agregar", "editar", "eliminar"];
export const LINK_ACTION_LABELS: Record<LinkAction, string> = {
  agregar: "Agregar", editar: "Editar", eliminar: "Eliminar",
};

// Única fuente de verdad de los "sub apartados" (links) de cada módulo,
// usada por el Sidebar, la home y el sistema de permisos de /equipo.
export interface SubApartado {
  href: string;
  icon: string;
  label: string;
  // true = además de poder verse, este sub apartado admite restringir
  // Agregar/Editar/Eliminar por separado (ver /equipo).
  acciones?: boolean;
}

export interface Apartado {
  module: ModuleKey;
  label: string;
  subApartados: SubApartado[];
}

export const NAV_GROUPS: Apartado[] = [
  {
    label: "Pedidos",
    module: "pedidos",
    subApartados: [
      { href: "/orders", icon: "fas fa-receipt", label: "Pedidos" },
      { href: "/procesar", icon: "fas fa-file-excel", label: "Procesar Pedidos" },
      { href: "/cambios", icon: "fas fa-right-left", label: "Cambios" },
      { href: "/etiquetas", icon: "fas fa-tags", label: "Agregar SKU a Etiquetas" },
      { href: "/tracking", icon: "fas fa-truck", label: "Subir Tracking" },
    ],
  },
  {
    label: "Mercado Libre",
    module: "mercadolibre",
    subApartados: [
      { href: "/mercadolibre", icon: "fas fa-plug", label: "Conectar Mercado Libre" },
      { href: "/mercadolibre/pedidos", icon: "fas fa-receipt", label: "Pedidos ML" },
      { href: "/etiquetas-ml", icon: "fas fa-barcode", label: "Etiquetas ML (ZPL → PDF)" },
    ],
  },
  {
    label: "Stock",
    module: "stock",
    subApartados: [
      { href: "/stock", icon: "fas fa-warehouse", label: "Stock de Productos" },
    ],
  },
  {
    label: "Finanzas",
    module: "finanzas",
    subApartados: [
      { href: "/finanzas", icon: "fas fa-chart-pie", label: "Gastos y Suscripciones" },
      { href: "/finanzas/transferencias", icon: "fas fa-money-bill-transfer", label: "Transferencias" },
    ],
  },
  {
    label: "Creativo",
    module: "creativo",
    subApartados: [
      { href: "/creativo?tab=angulo", icon: "fas fa-arrows-turn-to-dots", label: "Ángulos", acciones: true },
      { href: "/creativo?tab=guion", icon: "fas fa-file-lines", label: "Guiones", acciones: true },
      { href: "/creativo?tab=formato", icon: "fas fa-clapperboard", label: "Formatos", acciones: true },
      { href: "/creativo?tab=marca", icon: "fas fa-star", label: "Marcas", acciones: true },
      { href: "/creativo?tab=referencia", icon: "fas fa-photo-film", label: "Referencias", acciones: true },
      { href: "/creativo?tab=renovacion", icon: "fas fa-folder", label: "Renovaciones", acciones: true },
      { href: "/creativo?tab=analisis", icon: "fas fa-diagram-project", label: "Análisis de Renovaciones", acciones: true },
      { href: "/creativo?tab=anuncio", icon: "fas fa-rectangle-ad", label: "Anuncios", acciones: true },
      { href: "/creativo?tab=objecion", icon: "fas fa-comments", label: "Preguntas y Objeciones", acciones: true },
      { href: "/creativo?tab=publicidad", icon: "fas fa-bullhorn", label: "Publicidad" },
    ],
  },
  {
    label: "Soporte",
    module: "soporte",
    subApartados: [
      { href: "/soporte", icon: "fas fa-headset", label: "Tickets de Soporte" },
    ],
  },
];

export const ALL_HREFS: string[] = NAV_GROUPS.flatMap((g) => g.subApartados.map((s) => s.href));

export function subApartadosForModule(moduleKey: ModuleKey): SubApartado[] {
  return NAV_GROUPS.find((g) => g.module === moduleKey)?.subApartados ?? [];
}

export function isValidHref(href: string): boolean {
  return ALL_HREFS.includes(href);
}

// linkAccess === undefined significa "todo lo del módulo permitido, sin
// restricciones puntuales". Solo cuando está definido se compara contra la
// lista exacta de hrefs permitidos.
export function hasLinkAccess(linkAccess: string[] | undefined, href: string): boolean {
  if (!linkAccess) return true;
  return linkAccess.includes(href);
}

// linkActions[href] === undefined significa "sin restricción explícita para
// ese sub apartado": puede agregar/editar/eliminar libremente (igual que
// linkAccess, el admin tiene que sacar la tilde a propósito para restringir
// una acción puntual). Solo cuando está definido para ese href se compara
// contra la lista exacta de acciones permitidas.
export function hasLinkAction(
  linkActions: Record<string, LinkAction[]> | undefined,
  href: string,
  accion: LinkAction,
): boolean {
  const acciones = linkActions?.[href];
  if (!acciones) return true;
  return acciones.includes(accion);
}

// Para tarjetas/links que representan un módulo entero (ej. la card de
// "Creativo" en el home, que no apunta a un sub apartado puntual): visible
// si el usuario tiene acceso a al menos uno de los tabs del módulo.
export function hasAnyAccessToModule(linkAccess: string[] | undefined, moduleKey: ModuleKey): boolean {
  const subs = subApartadosForModule(moduleKey);
  if (subs.length === 0) return true;
  return subs.some((s) => hasLinkAccess(linkAccess, s.href));
}
