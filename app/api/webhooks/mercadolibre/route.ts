import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Este webhook ya no descuenta stock: Mercado Libre no tiene todavía un
// paso de confirmación física de despacho equivalente a Despacho/Andreani
// (usa su propio flujo de etiquetas ZPL), así que por ahora las ventas de
// ML no descuentan stock automáticamente en ningún momento — decisión
// explícita, no un olvido. Se deja el endpoint respondiendo 200 para no
// romper la notificación ya registrada en Mercado Libre, aunque hoy no
// haga ningún trabajo.
export async function POST(req: NextRequest) {
  try {
    await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
