// Tipos internos de la aplicación

// -------------------------------------------------------------------
// Fila cruda tal como viene del CSV de Tienda Nube
// Las claves son strings porque los encabezados pueden variar
// -------------------------------------------------------------------
export type TiendaNubeRow = Record<string, string>;

// -------------------------------------------------------------------
// Pedido agrupado: una orden = un solo objeto con los datos del envío
// Se descarta la info de productos individuales (irrelevante para Andreani)
// -------------------------------------------------------------------
export interface GroupedOrder {
  numeroOrden: string;
  nombreEnvio: string;
  dni: string;
  email: string;
  telefono: string;
  medioEnvio: string;
  // Campos de domicilio (normalizados)
  direccion: string;
  numeroDireccion: string;
  piso: string;
  localidad: string;
  provincia: string;
  codigoPostal: string;
  // Columna Ciudad del CSV (separada de Localidad)
  ciudad: string;
  // Valores crudos del CSV (para mostrar comparativa en la UI)
  rawLocalidad: string;
  rawProvincia: string;
  rawCodigoPostal: string;
  // Para envíos a sucursal
  sucursal: string;
}

// -------------------------------------------------------------------
// Registro final para la hoja "A domicilio"
// -------------------------------------------------------------------
export interface AndreaniDomicilio {
  "Paquete Guardado": string;
  "Peso (grs)": number;
  "Alto (cm)": number;
  "Ancho (cm)": number;
  "Profundidad (cm)": number;
  "Valor declarado ($ c/IVA)": number;
  "Numero Interno": string;
  "Nombre": string;
  "Apellido": string;
  "DNI": string;
  "Email": string;
  "Celular código": string;
  "Celular número": string;
  "Calle": string;
  "Número": string;
  "Piso": string;
  "Departamento": string;
  "Provincia / Localidad / CP": string;
  "Observaciones": string;
}

// -------------------------------------------------------------------
// Registro final para la hoja "A sucursal"
// -------------------------------------------------------------------
export interface AndreaniSucursal {
  "Paquete Guardado": string;
  "Peso (grs)": number;
  "Alto (cm)": number;
  "Ancho (cm)": number;
  "Profundidad (cm)": number;
  "Valor declarado ($ c/IVA)": number;
  "Numero Interno": string;
  "Nombre": string;
  "Apellido": string;
  "DNI": string;
  "Email": string;
  "Celular código": string;
  "Celular número": string;
  "Sucursal": string;
}

// -------------------------------------------------------------------
// Error de validación asociado a una orden
// -------------------------------------------------------------------
export interface ValidationError {
  numeroOrden: string;
  campos: string[];   // Lista de campos con problemas
  tipo: "domicilio" | "sucursal";
}

// -------------------------------------------------------------------
// ── Tienda Nube REST API order types ─────────────────────────────

export interface TnProduct {
  name: string;
  sku: string | null;
  quantity: number;
  variant_name: string | null;
}

export interface TnShippingAddress {
  name:       string;
  first_name?: string;
  last_name?:  string;
  phone?:      string;
  address:    string;
  number?:    string;
  floor?:     string;
  apartment?: string;
  locality?:  string;
  city:       string;
  province:   string | { id: number; name: string; code?: string };
  zipcode:    string;
}

export interface TnOrder {
  id: number;
  number: number;
  created_at: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  contact_identification?: string | null;
  status: "open" | "closed" | "cancelled";
  payment_status: "paid" | "pending" | "voided" | "refunded" | "abandoned";
  shipping_status: "unshipped" | "unpacked" | "packed" | "shipped" | "delivered";
  total: string;
  currency: string;
  products: TnProduct[];
  shipping_address: TnShippingAddress | null;
  shipping_option:  string | { id?: number; name?: string; code?: string } | null;
  shipping_carrier_name?: string | null;
  fulfillments: unknown[];
}

export interface OrdersApiResponse {
  orders: TnOrder[];
  total: number;
}

// ── Resultado completo del procesamiento ─────────────────────────
// -------------------------------------------------------------------
export interface ProcessingResult {
  totalFilas: number;
  ordenesUnicas: number;
  domicilio: AndreaniDomicilio[];
  sucursal: AndreaniSucursal[];
  errores: ValidationError[];
  // Órdenes agrupadas con raw data para comparativas en la UI
  groupedOrders: GroupedOrder[];
}
