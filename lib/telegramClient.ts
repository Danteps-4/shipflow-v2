// Cliente mínimo de la Bot API de Telegram — solo lo necesario para
// responder en el chat de conciliación de transferencias.

export async function enviarMensajeTelegram(chatId: string, texto: string): Promise<void> {
  const token = process.env.TELEGRAM_PAYMENT_BOT_TOKEN;
  if (!token) return; // sin token configurado, no hay a quién avisarle
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
  } catch {
    // El aviso en Telegram es un extra informativo — si falla, no debe
    // tirar abajo el procesamiento del webhook.
  }
}
