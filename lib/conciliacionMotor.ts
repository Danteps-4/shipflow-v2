import { getAllTnConexiones } from "./mlDb";
import { buscarPedidosPendientesTransferencia } from "./conciliacionTnClient";
import {
  CandidateMatch, TransferParsed, evaluarCandidato, decidirNivel,
} from "./conciliacionMatching";
import {
  TransferenciaBancaria, actualizarResultadoMatching, marcarError, registrarAuditoria,
} from "./conciliacionTransferenciasDb";
import { enviarMensajeTelegram } from "./telegramClient";

function toleranciaCents(): number {
  return Number(process.env.PAYMENT_AMOUNT_TOLERANCE_CENTS ?? "100");
}

function ventanaDias(): number {
  return Number(process.env.PAYMENT_MATCH_LOOKBACK_DAYS ?? "7");
}

function fmtPesos(cents: number): string {
  return (cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Corre el motor de conciliación para una transferencia ya guardada:
// busca candidatos en todas las tiendas conectadas, decide el nivel, y deja
// el resultado + auditoría persistidos. Si Tiendanube falla, la fila queda
// en ERROR con reintento programado (nunca se pierde el evento).
export async function procesarTransferencia(transferencia: TransferenciaBancaria): Promise<void> {
  const transfer: TransferParsed = {
    amountCents: Number(transferencia.amount_cents),
    senderName: transferencia.sender_name ?? "",
    cuitCuil: transferencia.cuit_cuil,
    detectedDni: transferencia.detected_dni,
    bankAccount: transferencia.bank_account,
    transactionId: transferencia.transaction_id,
    receivedAt: transferencia.received_at ? new Date(transferencia.received_at) : null,
  };

  await registrarAuditoria(transferencia.id, "recibido", { transactionId: transfer.transactionId });
  if (transfer.detectedDni) {
    await registrarAuditoria(transferencia.id, "dni_extraido", { dni: transfer.detectedDni });
  }

  let evaluaciones: CandidateMatch[];
  try {
    const conexiones = await getAllTnConexiones();
    const candidatosPorStore = await Promise.all(
      conexiones.map(c => buscarPedidosPendientesTransferencia(c.store_id, c.access_token, ventanaDias())),
    );
    const candidatos = candidatosPorStore.flat();
    evaluaciones = candidatos.map(c => evaluarCandidato(c, transfer, toleranciaCents()));
  } catch (err) {
    const proximoReintento = new Date(Date.now() + backoffMs(transferencia.retry_count));
    await marcarError(transferencia.id, proximoReintento);
    await registrarAuditoria(transferencia.id, "error_consultando_tiendanube", { error: String(err) });
    return;
  }

  await registrarAuditoria(transferencia.id, "candidatos_encontrados", { cantidad: evaluaciones.length });

  const decision = decidirNivel(evaluaciones);
  const sel = decision.seleccionado;

  await actualizarResultadoMatching(transferencia.id, {
    estado: decision.nivel,
    storeId: sel?.candidate.storeId ?? null,
    matchedOrderId: sel?.candidate.orderId ?? null,
    matchedOrderNumber: sel?.candidate.orderNumber ?? null,
    orderAmountCents: sel?.candidate.totalCents ?? null,
    amountDifferenceCents: sel ? Math.abs(sel.candidate.totalCents - transfer.amountCents) : null,
    matchDni: sel?.matchDni ?? null,
    matchAmount: sel?.matchAmount ?? null,
    matchName: sel?.matchName ?? null,
    matchMethod: sel?.matchMethod ?? null,
    candidatesJson: decision.nivel === "REQUIRES_REVIEW" ? decision.candidatos.map(c => ({
      orderId: c.candidate.orderId, orderNumber: c.candidate.orderNumber,
      matchDni: c.matchDni, matchAmount: c.matchAmount, matchName: c.matchName,
    })) : null,
  });

  await registrarAuditoria(transferencia.id, `nivel_${decision.nivel.toLowerCase()}`, {
    pedido: sel?.candidate.orderNumber ?? null,
  });

  await avisarPorTelegram(transferencia, decision.nivel, sel);
}

function backoffMs(retryCount: number): number {
  const pasos = [60_000, 5 * 60_000, 15 * 60_000];
  return pasos[Math.min(retryCount, pasos.length - 1)];
}

async function avisarPorTelegram(
  t: TransferenciaBancaria, nivel: string, sel: CandidateMatch | null,
): Promise<void> {
  const chatId = t.telegram_chat_id ?? process.env.TELEGRAM_PAYMENT_CHAT_ID;
  if (!chatId) return;
  const monto = fmtPesos(Number(t.amount_cents));
  const dniFmt = t.detected_dni ?? "sin detectar";

  if (nivel === "AUTO_MATCHED" && sel) {
    const pedidoMonto = fmtPesos(sel.candidate.totalCents);
    const diferencia = fmtPesos(Math.abs(sel.candidate.totalCents - Number(t.amount_cents)));
    await enviarMensajeTelegram(chatId,
      `✅ TRANSFERENCIA MATCHEADA\nPedido: #${sel.candidate.orderNumber}\nCliente: ${t.sender_name}\nTransferencia: $${monto}\nPedido: $${pedidoMonto}\nDiferencia: $${diferencia}\nDNI: ${dniFmt}\n\nQueda pendiente confirmarlo en Tiendanube.`);
  } else if (nivel === "REQUIRES_REVIEW") {
    await enviarMensajeTelegram(chatId,
      `⚠️ REQUIERE REVISIÓN\nTransferencia: $${monto}\nCliente: ${t.sender_name}\nDNI: ${dniFmt}\n\nRevisar en ShipFlow.`);
  } else if (nivel === "UNMATCHED") {
    await enviarMensajeTelegram(chatId,
      `❓ TRANSFERENCIA SIN PEDIDO\nMonto: $${monto}\nCliente: ${t.sender_name}\nDNI: ${dniFmt}\n\nNo se encontró ningún pedido pendiente compatible.`);
  }
}
