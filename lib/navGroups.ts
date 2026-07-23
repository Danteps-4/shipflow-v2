import { ModuleKey } from "./modules";

// Única fuente de verdad de los "sub apartados" (links) de cada módulo,
// usada por el Sidebar, la home y el sistema de permisos de /equipo.
export interface SubApartado {
  href: string;
  icon: string;
  label: string;
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
      { href: "/creativo", icon: "fas fa-clapperboard", label: "Ángulos, guiones y formatos" },
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
