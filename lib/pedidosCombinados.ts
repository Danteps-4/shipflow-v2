import type { GroupedOrder, ProductoOrden } from "@/types/orders";
import { slugify } from "./normalizers";

// Detección y armado de envíos combinados: varios pedidos del mismo cliente
// que salen en un solo paquete (se paga un solo envío). Todo puro, sin red ni
// base: se usa tanto en el navegador (/procesar) como en el servidor.

export interface GrupoDuplicado {
  // Identifica al grupo (números de pedido ordenados) — sirve de key y para
  // recordar cuáles descartó el usuario.
  clave: string;
  ordenes: GroupedOrder[];
  motivos: string[];
}

function numeroOrdenable(n: string): number {
  const v = parseInt(n, 10);
  return Number.isNaN(v) ? Number.MAX_SAFE_INTEGER : v;
}

function clavesDe(o: GroupedOrder): { clave: string; motivo: string }[] {
  const out: { clave: string; motivo: string }[] = [];
  if (o.dni.length >= 6) out.push({ clave: `dni:${o.dni}`, motivo: "mismo DNI" });
  const email = o.email.trim().toLowerCase();
  if (email.includes("@")) out.push({ clave: `email:${email}`, motivo: "mismo email" });
  if (o.telefono.length >= 8) out.push({ clave: `tel:${o.telefono.slice(-10)}`, motivo: "mismo teléfono" });
  const nombre = slugify(o.nombreEnvio).replace(/\s+/g, " ");
  if (nombre && o.codigoPostal) out.push({ clave: `nombre:${nombre}|${o.codigoPostal}`, motivo: "mismo nombre y código postal" });
  return out;
}

// Agrupa los pedidos que comparten algún dato de contacto (DNI, email,
// teléfono, o nombre + CP). Si A comparte algo con B y B con C, los tres
// quedan en el mismo grupo. No decide nada: son candidatos que confirma una
// persona (puede haber dos clientes distintos con el mismo teléfono).
export function detectarDuplicados(orders: GroupedOrder[]): GrupoDuplicado[] {
  const candidatas = orders.filter(o => !o.retiroPresencial);
  const padre = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (padre.get(r) !== r) r = padre.get(r)!;
    padre.set(x, r);
    return r;
  };
  for (const o of candidatas) padre.set(o.numeroOrden, o.numeroOrden);

  const porClave = new Map<string, { motivo: string; numeros: string[] }>();
  for (const o of candidatas) {
    for (const { clave, motivo } of clavesDe(o)) {
      const e = porClave.get(clave) ?? { motivo, numeros: [] };
      e.numeros.push(o.numeroOrden);
      porClave.set(clave, e);
    }
  }
  for (const { numeros } of porClave.values()) {
    for (let i = 1; i < numeros.length; i++) {
      const a = find(numeros[0]);
      const b = find(numeros[i]);
      if (a !== b) padre.set(b, a);
    }
  }

  const grupos = new Map<string, GroupedOrder[]>();
  for (const o of candidatas) {
    const r = find(o.numeroOrden);
    grupos.set(r, [...(grupos.get(r) ?? []), o]);
  }

  const resultado: GrupoDuplicado[] = [];
  for (const ordenes of grupos.values()) {
    if (ordenes.length < 2) continue;
    ordenes.sort((a, b) => numeroOrdenable(a.numeroOrden) - numeroOrdenable(b.numeroOrden));
    const numeros = new Set(ordenes.map(o => o.numeroOrden));
    const motivos = new Set<string>();
    for (const { motivo, numeros: ns } of porClave.values()) {
      if (ns.filter(n => numeros.has(n)).length >= 2) motivos.add(motivo);
    }
    resultado.push({
      clave: ordenes.map(o => o.numeroOrden).join("+"),
      ordenes,
      motivos: [...motivos],
    });
  }
  resultado.sort((a, b) => numeroOrdenable(a.ordenes[0].numeroOrden) - numeroOrdenable(b.ordenes[0].numeroOrden));
  return resultado;
}

// Une `secundarias` al pedido `principal`: el principal es el único que sale
// en el Excel (conserva su dirección/sucursal) y las demás quedan colgadas en
// `combinadas`, con todos sus datos, por si hay que deshacerlo.
export function combinarPedidos(orders: GroupedOrder[], principal: string, secundarias: string[]): GroupedOrder[] {
  const sec = new Set(secundarias.filter(n => n !== principal));
  const aCombinar = orders.filter(o => sec.has(o.numeroOrden));
  return orders
    .filter(o => !sec.has(o.numeroOrden))
    .map(o => o.numeroOrden === principal
      ? { ...o, combinadas: [...(o.combinadas ?? []), ...aCombinar] }
      : o);
}

// Devuelve cada pedido combinado a la lista como un envío independiente.
export function deshacerCombinacion(orders: GroupedOrder[], principal: string): GroupedOrder[] {
  const resultado: GroupedOrder[] = [];
  for (const o of orders) {
    if (o.numeroOrden === principal && o.combinadas?.length) {
      const { combinadas, ...resto } = o;
      resultado.push(resto, ...combinadas);
    } else {
      resultado.push(o);
    }
  }
  return resultado;
}

// Suma las cantidades de los productos con el mismo SKU, conservando el orden
// de aparición (para que la etiqueta diga "ABDOMEN x2" y no "ABDOMEN | ABDOMEN").
export function sumarSkus<T extends { sku: string; cantidad: number }>(items: T[]): T[] {
  const out: T[] = [];
  for (const it of items) {
    const key = it.sku.trim().toUpperCase();
    const prev = out.find(o => o.sku.trim().toUpperCase() === key);
    if (prev) prev.cantidad += it.cantidad;
    else out.push({ ...it });
  }
  return out;
}

// Todos los productos que van en el paquete: los del pedido principal más los
// de cada pedido combinado.
export function productosCombinados(order: GroupedOrder): ProductoOrden[] {
  return [
    ...(order.productos ?? []),
    ...(order.combinadas ?? []).flatMap(c =>
      (c.productos ?? []).map(p => ({ ...p, ordenOrigen: c.numeroOrden }))),
  ];
}
