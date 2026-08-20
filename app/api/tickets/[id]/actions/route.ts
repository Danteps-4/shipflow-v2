import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule, requireTicketsSupervisor } from "@/lib/permissions";
import { initTicketsTables, addAccion, updateAccion, deleteAccion, addCosto, addHistorial, TIPOS_ACCION, TipoAccion, TIPOS_COSTO, TipoCosto } from "@/lib/ticketsDb";
import { initCambiosTables, createCambio, TipoCambio } from "@/lib/cambiosDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

const ACCION_LABELS: Record<TipoAccion, string> = {
  generar_envio: "Generar nuevo envío",
  modificar_pedido: "Modificar pedido",
  cambiar_direccion: "Cambio de dirección/sucursal",
  generar_devolucion: "Generar devolución",
  reembolso: "Reembolso",
  cancelar_pedido: "Cancelar pedido",
  generar_link_pago: "Generar link de pago",
  resolver_sin_costo: "Resolver sin costo",
  otra_accion: "Otra acción",
};

interface EnvioBody {
  generarEnvio?: boolean;
  envioTipo?: TipoCambio;
  envioNombre?: string; envioTelefono?: string; envioEmail?: string; envioDni?: string;
  envioDireccion?: string; envioNumeroDireccion?: string; envioPiso?: string; envioLocalidad?: string;
  envioProvincia?: string; envioCodigoPostal?: string; envioSucursal?: string;
  numeroPedidoOriginal?: string;
}

function validarEnvio(body: EnvioBody): string | null {
  if (!body.envioNombre?.trim()) return "Falta el nombre del destinatario del envío";
  if (!body.envioTelefono?.trim()) return "Falta el teléfono del destinatario del envío";
  if (body.envioTipo !== "domicilio" && body.envioTipo !== "sucursal") return "Tipo de envío inválido";
  if (body.envioTipo === "sucursal" && !body.envioSucursal?.trim()) return "Falta la sucursal del envío";
  if (body.envioTipo === "domicilio" && (!body.envioDireccion?.trim() || !body.envioNumeroDireccion?.trim())) {
    return "Falta calle y número del envío";
  }
  return null;
}

// Registra una acción de la sección "Resolver ticket". En esta fase esto
// solo guarda la intención (queda en el historial) — no ejecuta nada de
// verdad (no dispara un reembolso, etc), salvo dos integraciones puntuales
// que sí crean un registro real en otro módulo cuando se piden explícitamente:
// 1) "agregarComoCosto": suma el monto a `caso_costos` (tabla separada, sin
//    vínculo automático — ver lib/ticketsDb.ts).
// 2) "generarEnvio": crea un Cambio real en el módulo Cambios (lib/cambiosDb.ts)
//    para que se pueda procesar y pagar con Andreani como cualquier otro
//    envío — vinculado al ticket por `cambios.ticket_caso_id` (referencia
//    blanda, no FK, mismo criterio que numero_pedido_original).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const body = await req.json() as {
    tipo?: string; detalle?: string; monto?: number; referencia?: string;
    agregarComoCosto?: boolean; costoTipo?: string;
  } & EnvioBody;
  if (!body.tipo || !TIPOS_ACCION.includes(body.tipo as TipoAccion)) {
    return NextResponse.json({ error: "Tipo de acción inválido" }, { status: 400 });
  }
  if (body.generarEnvio) {
    const envioError = validarEnvio(body);
    if (envioError) return NextResponse.json({ error: envioError }, { status: 400 });
  }

  await initTicketsTables();
  const casoId = Number(params.id);
  const accion = await addAccion(casoId, {
    tipo: body.tipo as TipoAccion,
    detalle: body.detalle,
    monto: body.monto,
    referencia: body.referencia,
  }, guard.user.name);

  if (body.agregarComoCosto && body.monto && body.monto > 0) {
    const costoTipo = body.costoTipo && TIPOS_COSTO.includes(body.costoTipo as TipoCosto) ? body.costoTipo as TipoCosto : "otro";
    await addCosto(casoId, {
      tipo: costoTipo,
      descripcion: `Costo de la acción "${ACCION_LABELS[body.tipo as TipoAccion]}"`,
      monto: body.monto,
    }, guard.user.name);
  }

  let cambio = null;
  if (body.generarEnvio) {
    const storeId = await getStoreId(req);
    if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    await initCambiosTables();
    cambio = await createCambio(storeId, {
      nombre: body.envioNombre!.trim(), telefono: body.envioTelefono!.trim(),
      email: body.envioEmail?.trim(), dni: body.envioDni?.trim(),
      motivo: `Ticket #${casoId} — ${ACCION_LABELS[body.tipo as TipoAccion]}`,
      numeroPedidoOriginal: body.numeroPedidoOriginal?.trim(),
      tipo: body.envioTipo!,
      direccion: body.envioDireccion, numeroDireccion: body.envioNumeroDireccion, piso: body.envioPiso,
      localidad: body.envioLocalidad, provincia: body.envioProvincia, codigoPostal: body.envioCodigoPostal,
      sucursal: body.envioSucursal,
      ticketCasoId: casoId,
      createdBy: guard.user.name,
    });
    await addHistorial(
      casoId, "otro",
      `${guard.user.name} generó un envío para Andreani (Cambio #${cambio.id}, ${body.envioTipo === "sucursal" ? "a sucursal" : "a domicilio"})`,
      guard.user.name, { cambioId: cambio.id, tipo: body.envioTipo },
    );
  }

  return NextResponse.json({ accion, cambio });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const body = await req.json() as { accionId?: number; detalle?: string | null; monto?: number | null; referencia?: string | null };
  if (!body.accionId) return NextResponse.json({ error: "Falta accionId" }, { status: 400 });

  await initTicketsTables();
  const accion = await updateAccion(Number(params.id), body.accionId, {
    detalle: body.detalle,
    monto: body.monto,
    referencia: body.referencia,
  }, guard.user.name);
  if (!accion) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ accion });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTicketsSupervisor(req);
  if (!guard.ok) return guard.response;

  const { accionId } = await req.json() as { accionId?: number };
  if (!accionId) return NextResponse.json({ error: "Falta accionId" }, { status: 400 });

  await initTicketsTables();
  const borrado = await deleteAccion(Number(params.id), accionId, guard.user.name);
  if (!borrado) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
