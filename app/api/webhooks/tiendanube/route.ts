import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.TN_CLIENT_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Este webhook ya no descuenta stock: el descuento se movió al escaneo en
// Despacho (ver procesarEscaneo() en lib/despachoDb.ts), que es el momento
// real en que el producto sale del depósito — antes se descontaba apenas se
// confirmaba el pago, lo que podía adelantarse a pedidos que después se
// cancelaban o nunca llegaban a despacharse. Se deja el endpoint respondiendo
// 200 (verificando la firma) para no romper el webhook ya registrado en
// Tienda Nube, aunque hoy no haga ningún trabajo.
export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
  const signature = req.headers.get("x-linkedstore-hmac-sha256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
