import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getAllTnConexiones } from "@/lib/mlDb";
import { buscarPedidoPorNumero } from "@/lib/conciliacionTnClient";
import { parseTotalTnACentavos } from "@/lib/conciliacionMatching";
import {
  getTransferenciaById, getAuditoria, vincularManualmente, descartarTransferencia, registrarAuditoria,
} from "@/lib/conciliacionTransferenciasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "finanzas", "/finanzas/conciliacion-transferencias");
  if (!guard.ok) return guard.response;

  const transferencia = await getTransferenciaById(Number(params.id));
  if (!transferencia) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const auditoria = await getAuditoria(transferencia.id);
  return NextResponse.json({ transferencia, auditoria });
}

interface PatchBody {
  accion: "vincular" | "descartar";
  orderNumber?: string;
}

// "vincular": busca el pedido por número en las tiendas conectadas y lo
// asocia a mano (mismo resultado que un match automático). "descartar":
// la transferencia no correspondía a ningún pedido real de esta tienda.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "finanzas", "/finanzas/conciliacion-transferencias");
  if (!guard.ok) return guard.response;

  const id = Number(params.id);
  const body = await req.json() as PatchBody;
  const transferencia = await getTransferenciaById(id);
  if (!transferencia) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  if (body.accion === "descartar") {
    await descartarTransferencia(id, guard.user.name);
    await registrarAuditoria(id, "descartada_manualmente", { por: guard.user.name });
    return NextResponse.json({ ok: true });
  }

  if (body.accion === "vincular") {
    const numero = body.orderNumber?.trim();
    if (!numero) return NextResponse.json({ error: "Falta el número de pedido" }, { status: 400 });

    const conexiones = await getAllTnConexiones();
    for (const conexion of conexiones) {
      let order;
      try {
        order = await buscarPedidoPorNumero(conexion.store_id, conexion.access_token, numero);
      } catch {
        continue;
      }
      if (order) {
        await vincularManualmente(id, conexion.store_id, String(order.id), String(order.number), guard.user.name);
        await registrarAuditoria(id, "vinculado_manualmente", {
          pedido: order.number, por: guard.user.name, montoPedido: parseTotalTnACentavos(order.total),
        });
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: `No se encontró el pedido #${numero} en ninguna tienda conectada` }, { status: 404 });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
