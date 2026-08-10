// Wrapper del buscador de sucursales público de Andreani
// (https://www.andreani.com/buscar-sucursal). No es una API oficial
// documentada: son los mismos dos endpoints que usa su propia web para
// cualquier visitante (sin login), descubiertos inspeccionando el tráfico
// de esa página. Como no están documentados, podrían cambiar sin aviso —
// por eso todo acá degrada a un array vacío ante cualquier error en vez
// de tirar una excepción, para que nunca rompa el resto del flujo.

const ANDREANI_BASE = "https://www.andreani.com";

export interface DireccionSugerida {
  label: string;
  lat: number;
  lng: number;
}

export interface SucursalCercana {
  nombre: string;
  direccion: string;
  distanciaKm: number;
  lat: number;
  lng: number;
  horario: string | null;
}

// Geocodifica una dirección en texto libre (ej. "Av Corrientes 1234, CABA")
// a una lista de candidatos con coordenadas.
export async function buscarDirecciones(query: string): Promise<DireccionSugerida[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(
      `${ANDREANI_BASE}/api/autosuggest?q=${encodeURIComponent(q)}&limit=8`,
      { headers: { "Accept": "application/json" } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      items?: { title?: string; address?: { label?: string }; position?: { lat: number; lng: number } }[];
    };
    return (data.items ?? [])
      .filter(item => item.position)
      .map(item => ({
        label: item.address?.label ?? item.title ?? q,
        lat: item.position!.lat,
        lng: item.position!.lng,
      }));
  } catch {
    return [];
  }
}

// Sucursales propias de Andreani (no "dealer"/Punto HOP) más cercanas a
// una coordenada, ya ordenadas por distancia real. El campo `nombre`
// coincide exactamente con el formato de lib/andreaniData.ts
// (ANDREANI_SUCURSALES), así que se puede usar directo como valor de
// "Sucursal" en el Excel de Andreani.
export async function sucursalesCercanas(lat: number, lng: number): Promise<SucursalCercana[]> {
  try {
    const res = await fetch(
      `${ANDREANI_BASE}/api/sucursales/byCoordenadas?lat=${lat}&lng=${lng}`,
      { headers: { "Accept": "application/json" } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      descripcion?: string; direccionSucursal?: string; distancia?: number;
      lat?: string; lng?: string; horarioDeAtencion?: string; tipo?: string;
    }[];
    return data
      .filter(s => s.tipo === "Sucursal" && s.descripcion)
      .map(s => ({
        nombre: s.descripcion!,
        direccion: s.direccionSucursal ?? "",
        distanciaKm: Math.round(((s.distancia ?? 0) / 1000) * 10) / 10,
        lat: Number(s.lat) || 0,
        lng: Number(s.lng) || 0,
        horario: s.horarioDeAtencion ?? null,
      }))
      .sort((a, b) => a.distanciaKm - b.distanciaKm);
  } catch {
    return [];
  }
}
