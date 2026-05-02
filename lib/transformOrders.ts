import {
  GroupedOrder,
  AndreaniDomicilio,
  AndreaniSucursal,
  ValidationError,
  ProcessingResult,
} from "@/types/orders";
import { splitNombreApellido, sanitizeAndreani } from "./normalizers";
import { matchProvLocCp, matchSucursal } from "./andreaniMatcher";

// -------------------------------------------------------------------
// Valores fijos para todos los pedidos (según reglas de negocio)
// -------------------------------------------------------------------
const FIXED_VALUES = {
  paqueteGuardado: "",
  peso: 1,
  alto: 1,
  ancho: 1,
  profundidad: 1,
  valorDeclarado: 6000,
  celularCodigo: "54",
  departamento: "",
  observaciones: "",
};

// -------------------------------------------------------------------
// Determina si un pedido es a sucursal
// -------------------------------------------------------------------
function esSucursal(medioEnvio: string): boolean {
  return medioEnvio.trim().toLowerCase() === "punto de retiro";
}

// -------------------------------------------------------------------
// Valida un pedido a domicilio y retorna lista de errores de campo
// -------------------------------------------------------------------
function validarDomicilio(order: GroupedOrder): string[] {
  const errores: string[] = [];
  if (!order.nombreEnvio) errores.push("Falta nombre para el envío");
  if (!order.telefono) errores.push("Falta teléfono");
  if (!order.direccion) errores.push("Falta dirección");
  if (!order.numeroDireccion) errores.push("Falta número de puerta");
  if (!order.provincia) errores.push("Falta provincia");
  if (!order.codigoPostal) errores.push("Falta código postal");
  return errores;
}

// -------------------------------------------------------------------
// Valida un pedido a sucursal y retorna lista de errores de campo
// -------------------------------------------------------------------
function validarSucursal(order: GroupedOrder): string[] {
  const errores: string[] = [];
  if (!order.nombreEnvio) errores.push("Falta nombre para el envío");
  if (!order.telefono) errores.push("Falta teléfono");
  if (!order.sucursal) {
    const isHop = /hop/i.test(order.rawMedioEnvio ?? "");
    errores.push(isHop
      ? "Falta sucursal de retiro (Punto Andreani HOP)"
      : "Falta sucursal de retiro (Sucursal Andreani)"
    );
  }
  return errores;
}

// -------------------------------------------------------------------
// Construye un registro AndreaniDomicilio a partir de un GroupedOrder
// -------------------------------------------------------------------
function toDomicilio(order: GroupedOrder): AndreaniDomicilio {
  const { nombre, apellido } = splitNombreApellido(order.nombreEnvio);
  // Prefer Ciudad (clean city name) over Localidad (often a neighborhood/barrio)
  const provinciaLocalidadCp = matchProvLocCp(
    order.provincia,
    order.ciudad || order.localidad,
    order.codigoPostal
  );

  return {
    "Paquete Guardado": FIXED_VALUES.paqueteGuardado,
    "Peso (grs)": FIXED_VALUES.peso,
    "Alto (cm)": FIXED_VALUES.alto,
    "Ancho (cm)": FIXED_VALUES.ancho,
    "Profundidad (cm)": FIXED_VALUES.profundidad,
    "Valor declarado ($ c/IVA)": FIXED_VALUES.valorDeclarado,
    "Numero Interno": order.numeroOrden,
    "Nombre":   sanitizeAndreani(nombre),
    "Apellido": sanitizeAndreani(apellido),
    "DNI": order.dni,
    "Email": order.email,
    "Celular código": FIXED_VALUES.celularCodigo,
    "Celular número": order.telefono,
    "Calle":    sanitizeAndreani(order.direccion),
    "Número":   sanitizeAndreani(order.numeroDireccion),
    "Piso":     sanitizeAndreani(order.piso),
    "Departamento": FIXED_VALUES.departamento,
    "Provincia / Localidad / CP": provinciaLocalidadCp,
    "Observaciones": FIXED_VALUES.observaciones,
  };
}

// -------------------------------------------------------------------
// Construye un registro AndreaniSucursal a partir de un GroupedOrder
// -------------------------------------------------------------------
function toSucursal(order: GroupedOrder): AndreaniSucursal {
  const { nombre, apellido } = splitNombreApellido(order.nombreEnvio);

  return {
    "Paquete Guardado": FIXED_VALUES.paqueteGuardado,
    "Peso (grs)": FIXED_VALUES.peso,
    "Alto (cm)": FIXED_VALUES.alto,
    "Ancho (cm)": FIXED_VALUES.ancho,
    "Profundidad (cm)": FIXED_VALUES.profundidad,
    "Valor declarado ($ c/IVA)": FIXED_VALUES.valorDeclarado,
    "Numero Interno": order.numeroOrden,
    "Nombre":   sanitizeAndreani(nombre),
    "Apellido": sanitizeAndreani(apellido),
    "DNI": order.dni,
    "Email": order.email,
    "Celular código": FIXED_VALUES.celularCodigo,
    "Celular número": order.telefono,
    "Sucursal": matchSucursal(order.sucursal),
  };
}

// -------------------------------------------------------------------
// Función principal: transforma una lista de órdenes agrupadas
// al resultado final de procesamiento
// -------------------------------------------------------------------
export function transformOrders(orders: GroupedOrder[]): Omit<ProcessingResult, "totalFilas" | "ordenesUnicas" | "groupedOrders"> {
  const domicilio: AndreaniDomicilio[] = [];
  const sucursal: AndreaniSucursal[] = [];
  const errores: ValidationError[] = [];

  for (const order of orders) {
    if (esSucursal(order.medioEnvio)) {
      // --- Pedido a sucursal ---
      const camposConError = validarSucursal(order);
      if (camposConError.length > 0) {
        errores.push({
          numeroOrden: order.numeroOrden,
          campos: camposConError,
          tipo: "sucursal",
        });
        // Con errores: NO se incluye en el Excel
      } else {
        sucursal.push(toSucursal(order));
      }
    } else {
      // --- Pedido a domicilio ---
      const camposConError = validarDomicilio(order);
      if (camposConError.length > 0) {
        errores.push({
          numeroOrden: order.numeroOrden,
          campos: camposConError,
          tipo: "domicilio",
        });
        // Con errores: NO se incluye en el Excel
      } else {
        domicilio.push(toDomicilio(order));
      }
    }
  }

  return { domicilio, sucursal, errores };
}
