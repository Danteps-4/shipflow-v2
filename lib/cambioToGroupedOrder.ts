import { GroupedOrder } from "@/types/orders";

// Forma mínima de un cambio (ver lib/cambiosDb.ts) — se redeclara acá en vez
// de importar del lib server-only, porque este archivo se usa desde
// componentes "use client".
export interface CambioResumen {
  id: number;
  nombre: string;
  telefono: string;
  email: string | null;
  dni: string | null;
  tipo: "domicilio" | "sucursal";
  direccion: string;
  numero_direccion: string;
  piso: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  sucursal: string;
}

// Un cambio se prefija "CAMBIO-{id}" en numeroOrden para poder distinguirlo
// de un pedido real de Tienda Nube (y para poder identificarlo de nuevo
// después de exportar, y marcarlo como procesado).
export function cambioToGroupedOrder(c: CambioResumen): GroupedOrder {
  return {
    numeroOrden: `CAMBIO-${c.id}`,
    nombreEnvio: c.nombre,
    dni: c.dni ?? "",
    email: c.email ?? "",
    telefono: c.telefono,
    medioEnvio: c.tipo === "sucursal" ? "Punto de retiro" : "Andreani a Domicilio",
    direccion: c.direccion,
    numeroDireccion: c.numero_direccion,
    piso: c.piso,
    localidad: c.localidad,
    provincia: c.provincia,
    codigoPostal: c.codigo_postal,
    ciudad: "",
    rawLocalidad: c.localidad,
    rawProvincia: c.provincia,
    rawCodigoPostal: c.codigo_postal,
    sucursal: c.sucursal,
  };
}
