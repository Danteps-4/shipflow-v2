import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule, requireRetirosSupervisor } from "@/lib/permissions";
import {
  initRetirosTables, marcarListo, registrarCobro, confirmarEntrega, cancelarRetiro,
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

type Accion = "marcar_listo" | "registrar_cobro" | "confirmar_entrega" | "cancelar";

interface AccionBody {
  accion?: Accion;
  pagoConfirmado?: boolean;
  overrideSupervisor?: boolean;
  motivo?: string | null;
}

// Todas las transiciones de estado de un retiro pasan por acá, en vez de un
// PATCH genérico — cada una tiene su propia validación de negocio (ej.
// "confirmar_entrega" no deja entregar con saldo pendiente sin autorización
// de supervisor, chequeado en el servidor, no solo en el cliente).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "retiros", "/retiros");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const id = Number(params.id);
  const body = await req.json() as AccionBody;
  await initRetirosTables();

  switch (body.accion) {
    case "marcar_listo": {
      const retiro = await marcarListo(storeId, id, guard.user.name);
      if (!retiro) return NextResponse.json({ error: "No se pudo marcar como listo" }, { status: 400 });
      return NextResponse.json({ retiro });
    }
    case "registrar_cobro": {
      const retiro = await registrarCobro(storeId, id, guard.user.name);
      if (!retiro) return NextResponse.json({ error: "No se pudo registrar el cobro" }, { status: 400 });
      return NextResponse.json({ retiro });
    }
    case "confirmar_entrega": {
      // El override (entregar con saldo pendiente sin cobrar) exige
      // supervisor validado en el servidor, no solo el flag del body.
      let overrideSupervisor = false;
      if (body.overrideSupervisor) {
        const supGuard = await requireRetirosSupervisor(req);
        if (!supGuard.ok) return supGuard.response;
        overrideSupervisor = true;
      }
      const result = await confirmarEntrega(storeId, id, guard.user.name, {
        pagoConfirmado: body.pagoConfirmado, overrideSupervisor,
      });
      if (!result.ok) {
        const mensajes: Record<string, string> = {
          no_encontrado: "No encontrado",
          ya_retirado: "Este retiro ya fue entregado",
          saldo_pendiente: "Hay un saldo pendiente sin confirmar. Se necesita autorización de un supervisor para entregar igual.",
        };
        const status = result.error === "no_encontrado" ? 404 : result.error === "saldo_pendiente" ? 409 : 400;
        return NextResponse.json({ error: mensajes[result.error], code: result.error }, { status });
      }
      return NextResponse.json({ retiro: result.retiro });
    }
    case "cancelar": {
      const supGuard = await requireRetirosSupervisor(req);
      if (!supGuard.ok) return supGuard.response;
      const retiro = await cancelarRetiro(storeId, id, body.motivo ?? null, guard.user.name);
      if (!retiro) return NextResponse.json({ error: "No se pudo cancelar" }, { status: 400 });
      return NextResponse.json({ retiro });
    }
    default:
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }
}
