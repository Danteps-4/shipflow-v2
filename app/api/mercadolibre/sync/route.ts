import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Este endpoint reconciliaba stock de Mercado Libre a mano (por si un
// webhook se perdía). Ya no se usa: ML no descuenta stock automáticamente
// en ningún momento (el descuento se movió al escaneo en Despacho, que hoy
// solo cubre Andreani — decisión explícita, ver lib/despachoDb.ts). El
// botón "Sincronizar ahora" en /mercadolibre se sacó junto con esto.
export async function POST() {
  return NextResponse.json({ error: "Ya no aplica: Mercado Libre no descuenta stock automáticamente." }, { status: 410 });
}
