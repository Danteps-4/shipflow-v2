export const MODULE_KEYS = [
  "pedidos",
  "mercadolibre",
  "stock",
  "finanzas",
  "creativo",
  "tickets",
  "retiros",
  "publicidad",
  "redes",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const ALL_MODULES: ModuleKey[] = [...MODULE_KEYS];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  pedidos: "Pedidos",
  mercadolibre: "Mercado Libre",
  stock: "Stock",
  finanzas: "Finanzas",
  creativo: "Creativo",
  tickets: "Tickets de Soporte",
  retiros: "Retiros Presenciales",
  publicidad: "Publicidad",
  redes: "Redes Sociales",
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
