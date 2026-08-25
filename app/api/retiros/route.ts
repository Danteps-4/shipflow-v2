import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import {
  initRetirosTables, getRetiros, createRetiro, getRetiroAbiertoPorPedido,
  ProductoRetiro, CanalPedidoRetiro, EstadoPagoRetiro,
} from "@/lib/retirosDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  await initRetirosTables();
  const retiros = await getRetiros(storeId, {
    q: sp.get("q") ?? undefined,
    estadoRetiro: sp.get("estado_retiro") ?? undefined,
    estadoPago: sp.get("estado_pago") ?? undefined,
    canal: sp.get("canal") ?? undefined,
    fecha: sp.get("fecha") ?? undefined,
  });
  return NextResponse.json({ retiros });
}

interface CreateRetiroBody {
  canalPedido?: CanalPedidoRetiro | null;
  numeroPedido?: string | null;
  pedidoIdInterno?: string | null;
  pedidoPagadoOriginal?: boolean | null;
  pedidoMetodoEntregaOriginal?: string | null;
  pedidoTrackingOriginal?: string | null;
  clienteNombre?: string;
  clienteTelefono?: string | null;
  clienteEmail?: string | null;
  clienteDni?: string | null;
  productos?: ProductoRetiro[];
  estadoPago?: EstadoPagoRetiro;
  fechaEstimada?: string | null;
  notas?: string | null;
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as CreateRetiroBody;
  if (!body.clienteNombre?.trim()) return NextResponse.json({ error: "Falta el nombre del cliente" }, { status: 400 });
  const productos = body.productos ?? [];
  if (!productos.length) return NextResponse.json({ error: "Agregá al menos un producto" }, { status: 400 });

  await initRetirosTables();

  if (body.canalPedido && body.numeroPedido) {
    const abierto = await getRetiroAbiertoPorPedido(storeId, body.canalPedido, body.numeroPedido);
    if (abierto) {
      return NextResponse.json(
        { error: `Este pedido ya tiene el retiro ${abierto.codigo} abierto.`, retiroExistente: abierto },
        { status: 409 },
      );
    }
  }

  const total = productos.reduce((s, p) => s + (p.cantidad || 0) * (p.precio || 0), 0);
  const estadoPago: EstadoPagoRetiro = body.pedidoPagadoOriginal ? "pagado" : (body.estadoPago ?? "pendiente");

  const retiro = await createRetiro(storeId, {
    canalPedido: body.canalPedido ?? null,
    numeroPedido: body.numeroPedido ?? null,
    pedidoIdInterno: body.pedidoIdInterno ?? null,
    pedidoPagadoOriginal: body.pedidoPagadoOriginal ?? null,
    pedidoMetodoEntregaOriginal: body.pedidoMetodoEntregaOriginal ?? null,
    pedidoTrackingOriginal: body.pedidoTrackingOriginal ?? null,
    clienteNombre: body.clienteNombre.trim(),
    clienteTelefono: body.clienteTelefono ?? null,
    clienteEmail: body.clienteEmail ?? null,
    clienteDni: body.clienteDni ?? null,
    productos,
    total,
    estadoPago,
    fechaEstimada: body.fechaEstimada ?? null,
    notas: body.notas ?? null,
    createdBy: guard.user.name,
  });

  return NextResponse.json({ retiro });
}
