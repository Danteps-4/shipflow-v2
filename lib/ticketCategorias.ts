// Árbol de categorías/subcategorías de Tickets. Es una constante (no una
// tabla de configuración) a propósito: hoy solo "Falla de producto" tiene
// subcategorías reales, y la forma de estos tipos es la misma que tendría
// una tabla de configuración más adelante, así que migrar no implica
// rediseñar nada, solo mover estos datos a filas.

export interface SubcategoriaNivel2 {
  valor: string;
  label: string;
}

export interface SubcategoriaNivel1 {
  valor: string;
  label: string;
  subcategorias?: SubcategoriaNivel2[];
}

export interface CategoriaTicket {
  valor: string;
  label: string;
  subcategorias?: SubcategoriaNivel1[];
}

const FALLAS: SubcategoriaNivel2[] = [
  { valor: "no_enciende", label: "No enciende" },
  { valor: "no_carga", label: "No carga" },
  { valor: "baja_potencia", label: "Baja potencia" },
  { valor: "no_genera_estimulacion", label: "No genera estimulación" },
  { valor: "funciona_intermitente", label: "Funciona intermitentemente" },
  { valor: "defecto_fisico", label: "Defecto físico" },
  { valor: "otro", label: "Otro" },
];

export const CATEGORIAS_TICKET: CategoriaTicket[] = [
  { valor: "cambio_direccion", label: "Cambio de dirección" },
  { valor: "modificacion_pedido", label: "Modificación de pedido" },
  { valor: "agregar_producto", label: "Agregar producto" },
  { valor: "quitar_producto", label: "Quitar producto" },
  { valor: "cambiar_producto", label: "Cambiar producto" },
  { valor: "cancelacion", label: "Cancelación" },
  {
    valor: "falla_producto", label: "Falla de producto",
    subcategorias: [
      { valor: "abdomen", label: "Abdomen", subcategorias: FALLAS },
      { valor: "brazos", label: "Brazos", subcategorias: FALLAS },
      { valor: "gluteos", label: "Glúteos", subcategorias: FALLAS },
      { valor: "controlador", label: "Controlador", subcategorias: FALLAS },
      { valor: "control_remoto", label: "Control remoto", subcategorias: FALLAS },
      { valor: "cable", label: "Cable", subcategorias: FALLAS },
      { valor: "otro", label: "Otro", subcategorias: FALLAS },
    ],
  },
  { valor: "cambio_garantia", label: "Cambio por garantía" },
  { valor: "producto_faltante", label: "Producto faltante" },
  { valor: "producto_incorrecto", label: "Producto incorrecto" },
  { valor: "dano_envio", label: "Daño durante envío" },
  { valor: "demora_logistica", label: "Demora logística" },
  { valor: "devuelto_remitente", label: "Pedido devuelto al remitente" },
  { valor: "devolucion", label: "Devolución" },
  { valor: "reembolso", label: "Reembolso" },
  { valor: "reclamo_ml", label: "Reclamo Mercado Libre" },
  { valor: "problema_pago", label: "Problema de pago" },
  { valor: "otro", label: "Otro" },
];

export function labelCategoria(valor: string): string {
  return CATEGORIAS_TICKET.find(c => c.valor === valor)?.label ?? valor;
}

export function labelSubcategoria1(categoria: string, valor: string): string {
  const cat = CATEGORIAS_TICKET.find(c => c.valor === categoria);
  return cat?.subcategorias?.find(s => s.valor === valor)?.label ?? valor;
}

export function labelSubcategoria2(categoria: string, sub1: string, valor: string): string {
  const cat = CATEGORIAS_TICKET.find(c => c.valor === categoria);
  const nivel1 = cat?.subcategorias?.find(s => s.valor === sub1);
  return nivel1?.subcategorias?.find(s => s.valor === valor)?.label ?? valor;
}
