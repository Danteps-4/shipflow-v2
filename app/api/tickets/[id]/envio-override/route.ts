import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { getTicketById, addHistorial } from "@/lib/ticketsDb";
import { initPedidoEnvioTables, setEnvioOverride, EnvioOverride, TipoEnvio } from "@/lib/pedidoEnvioDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

const OVERRIDE_VACIO: EnvioOverride = {
  tipo: null, direccion: null, numeroDireccion: null, piso: null,
  localidad: null, provincia: null, codigoPostal: null, sucursal: null,
};

// Corrige el destino (domicilio/sucursal) del pedido real de Tienda Nube que
// originó el ticket — reusa la misma tabla `pedido_envio_overrides` que ya
// usan /orders y /procesar (lib/pedidoEnvioDb.ts), así que la corrección
// hecha desde acá ya aparece aplicada al momento de procesar ese pedido, sin
// generar un Cambio aparte. Solo aplica a canal_pedido "tiendanube" — Mercado
// Libre no tiene este mecanismo.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const casoId = Number(params.id);
  const ticket = await getTicketById(storeId, casoId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (ticket.canal_pedido !== "tiendanube") {
    return NextResponse.json({ error: "La corrección de destino solo aplica a pedidos de Tienda Nube" }, { status: 400 });
  }

  const body = await req.json() as { tipo?: TipoEnvio; direccion?: string; numeroDireccion?: string; piso?: string; localidad?: string; provincia?: string; codigoPostal?: string; sucursal?: string };
  if (body.tipo !== "domicilio" && body.tipo !== "sucursal") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  if (body.tipo === "sucursal" && !body.sucursal?.trim()) return NextResponse.json({ error: "Falta la sucursal" }, { status: 400 });
  if (body.tipo === "domicilio" && (!body.direccion?.trim() || !body.numeroDireccion?.trim())) {
    return NextResponse.json({ error: "Falta calle y número" }, { status: 400 });
  }

  const override: EnvioOverride = {
    tipo: body.tipo,
    direccion: body.direccion ?? null, numeroDireccion: body.numeroDireccion ?? null, piso: body.piso ?? null,
    localidad: body.localidad ?? null, provincia: body.provincia ?? null, codigoPostal: body.codigoPostal ?? null,
    sucursal: body.sucursal ?? null,
  };

  await initPedidoEnvioTables();
  await setEnvioOverride(storeId, ticket.numero_pedido, override);
  await addHistorial(
    casoId, "otro",
    `${guard.user.name} corrigió el destino de envío del pedido (${body.tipo === "sucursal" ? "a sucursal" : "a domicilio"})`,
    guard.user.name, { tipo: body.tipo },
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const casoId = Number(params.id);
  const ticket = await getTicketById(storeId, casoId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await initPedidoEnvioTables();
  await setEnvioOverride(storeId, ticket.numero_pedido, OVERRIDE_VACIO);
  await addHistorial(casoId, "otro", `${guard.user.name} quitó la corrección de destino del pedido`, guard.user.name);
  return NextResponse.json({ ok: true });
}
