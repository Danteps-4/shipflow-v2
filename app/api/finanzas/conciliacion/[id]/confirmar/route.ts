import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getTnConexion } from "@/lib/mlDb";
import { consultarPedido } from "@/lib/conciliacionTnClient";
import { getTransferenciaById, confirmarTransferencia, marcarError, registrarAuditoria } from "@/lib/conciliacionTransferenciasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Se llama cuando la persona ya entró a Tiendanube y marcó el pedido como
// pagado ahí — nunca se da la conciliación por exitosa sin volver a
// consultar Tiendanube y verificar payment_status === "paid".
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "finanzas", "/finanzas/conciliacion-transferencias");
  if (!guard.ok) return guard.response;

  const id = Number(params.id);
  const transferencia = await getTransferenciaById(id);
  if (!transferencia) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (!transferencia.store_id || !transferencia.matched_order_id) {
    return NextResponse.json({ error: "Esta transferencia todavía no tiene un pedido vinculado" }, { status: 400 });
  }

  const conexion = await getTnConexion(transferencia.store_id);
  if (!conexion) return NextResponse.json({ error: "No se encontró la conexión de Tiendanube para esta tienda" }, { status: 404 });

  let order;
  try {
    order = await consultarPedido(conexion.store_id, conexion.access_token, transferencia.matched_order_id);
  } catch (err) {
    const proximoReintento = new Date(Date.now() + 60_000);
    await marcarError(id, proximoReintento);
    await registrarAuditoria(id, "error_verificando_pago", { error: String(err) });
    return NextResponse.json({ error: "No se pudo consultar Tiendanube, probá de nuevo en un minuto" }, { status: 502 });
  }

  if (order.payment_status !== "paid") {
    return NextResponse.json(
      { error: `El pedido #${order.number} todavía figura "${order.payment_status}" en Tiendanube — confirmalo ahí primero.` },
      { status: 409 },
    );
  }

  await confirmarTransferencia(id, guard.user.name);
  await registrarAuditoria(id, "verificado_en_tiendanube", { pedido: order.number, paymentStatus: order.payment_status, por: guard.user.name });
  return NextResponse.json({ ok: true });
}
