import { NextRequest, NextResponse } from "next/server";
import { parseMensajeTelegram } from "@/lib/conciliacionMatching";
import { initConciliacionTables, crearTransferenciaDetectada, registrarAuditoria } from "@/lib/conciliacionTransferenciasDb";
import { procesarTransferencia } from "@/lib/conciliacionMotor";

export const runtime = "nodejs";

interface TelegramUpdate {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; is_bot?: boolean };
    sender_chat?: { id: number };
  };
}

// Nada de esto tiene sesión de SHIPFLOW (llega directo de Telegram) — mismo
// espíritu que app/api/webhooks/tiendanube/route.ts: verificar el origen,
// responder rápido, y hacer el trabajo pesado en background.
export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const secretEsperado = process.env.TELEGRAM_PAYMENT_WEBHOOK_SECRET;
  if (!secretEsperado || secretHeader !== secretEsperado) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });

  // Solo procesar mensajes del chat/grupo autorizado — cualquier otro se
  // ignora sin dejar rastro.
  const chatEsperado = process.env.TELEGRAM_PAYMENT_CHAT_ID;
  if (!chatEsperado || String(message.chat.id) !== chatEsperado) {
    return NextResponse.json({ ok: true });
  }

  // Si está configurado un remitente autorizado, exigirlo — evita que
  // cualquier persona del grupo escriba a mano un mensaje con el formato
  // de una transferencia y genere una conciliación falsa.
  const senderEsperado = process.env.TELEGRAM_ALLOWED_SENDER_ID;
  if (senderEsperado) {
    const senderId = message.from?.id ?? message.sender_chat?.id;
    if (String(senderId) !== senderEsperado) {
      return NextResponse.json({ ok: true });
    }
  }

  const transfer = parseMensajeTelegram(message.text);
  if (!transfer) return NextResponse.json({ ok: true }); // no es un aviso de ingreso, se ignora

  procesar(transfer, message).catch(e => console.error("[webhooks/telegram] error inesperado:", e));
  return NextResponse.json({ ok: true });
}

async function procesar(
  transfer: NonNullable<ReturnType<typeof parseMensajeTelegram>>,
  message: NonNullable<TelegramUpdate["message"]>,
): Promise<void> {
  await initConciliacionTables();
  const { transferencia, yaExistia } = await crearTransferenciaDetectada({
    transactionId: transfer.transactionId,
    telegramMessageId: String(message.message_id),
    telegramChatId: String(message.chat.id),
    senderName: transfer.senderName,
    cuitCuil: transfer.cuitCuil,
    detectedDni: transfer.detectedDni,
    bankAccount: transfer.bankAccount,
    amountCents: transfer.amountCents,
    receivedAt: transfer.receivedAt,
    originalMessage: message.text ?? "",
  });

  if (yaExistia) {
    await registrarAuditoria(transferencia.id, "evento_duplicado_ignorado", { transactionId: transfer.transactionId });
    return;
  }

  await procesarTransferencia(transferencia);
}
