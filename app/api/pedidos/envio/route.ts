import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { initPedidoEnvioTables, getEnvioOverridesPorOrdenes, setEnvioOverride, EnvioOverride, TipoEnvio } from "@/lib/pedidoEnvioDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

const TIPOS_VALIDOS: TipoEnvio[] = ["domicilio", "sucursal", "retiro"];

export async function GET(req: NextRequest) {
  // Se usa tanto desde /orders como desde /procesar, así que se gatea solo
  // por módulo (no hay un único sub apartado dueño de esta ruta).
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

// Body: { numeroOrden, tipo?, direccion?, numeroDireccion?, piso?, localidad?,
// provincia?, codigoPostal?, sucursal? }. Cualquier campo omitido o en null
// significa "sin override para ese campo" (se usa lo que vino de Tienda Nube).
export async function POST(req: NextRequest) {
  // Se usa tanto desde /orders como desde /procesar, así que se gatea solo
  // por módulo (no hay un único sub apartado dueño de esta ruta).
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as { numeroOrden?: string | number } & Partial<EnvioOverride>;
  const { numeroOrden } = body;
  if (!numeroOrden) return NextResponse.json({ error: "Falta numeroOrden" }, { status: 400 });
  if (body.tipo != null && !TIPOS_VALIDOS.includes(body.tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }

  const override: EnvioOverride = {
    tipo: body.tipo ?? null,
    direccion: body.direccion ?? null,
    numeroDireccion: body.numeroDireccion ?? null,
    piso: body.piso ?? null,
    localidad: body.localidad ?? null,
    provincia: body.provincia ?? null,
    codigoPostal: body.codigoPostal ?? null,
    sucursal: body.sucursal ?? null,
  };

  await initPedidoEnvioTables();
  await setEnvioOverride(storeId, String(numeroOrden), override);
  return NextResponse.json({ ok: true });
}
