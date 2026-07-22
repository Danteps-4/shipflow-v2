import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initPedidoEnvioTables, getEnvioOverridesPorOrdenes, setEnvioOverride, TipoEnvio } from "@/lib/pedidoEnvioDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

const TIPOS_VALIDOS: TipoEnvio[] = ["domicilio", "sucursal"];

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const numeros = (req.nextUrl.searchParams.get("numeros") ?? "")
    .split(",")
    .map(n => n.trim())
    .filter(Boolean);

  await initPedidoEnvioTables();
  const overrides = await getEnvioOverridesPorOrdenes(storeId, numeros);
  return NextResponse.json({ overrides });
}

// Body: { numeroOrden, tipo }. tipo: "domicilio" | "sucursal" | null (null = volver a automático).
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { numeroOrden, tipo } = await req.json() as { numeroOrden?: string | number; tipo?: TipoEnvio | null };
  if (!numeroOrden) return NextResponse.json({ error: "Falta numeroOrden" }, { status: 400 });
  if (tipo != null && !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }

  await initPedidoEnvioTables();
  await setEnvioOverride(storeId, String(numeroOrden), tipo ?? null);
  return NextResponse.json({ ok: true });
}
