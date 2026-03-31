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
  // Campos de domicilio
  direccion: string;
  numeroDireccion: string;
  piso: string;
  localidad: string;
  provincia: string;
  codigoPostal: string;
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
// Resultado completo del procesamiento
// -------------------------------------------------------------------
export interface ProcessingResult {
  totalFilas: number;
  ordenesUnicas: number;
  domicilio: AndreaniDomicilio[];
  sucursal: AndreaniSucursal[];
  errores: ValidationError[];
}
