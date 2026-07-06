const TN_API = "https://api.tiendanube.com/v1";

// Registra (si no existe ya) la suscripción al webhook order/paid para
// que Tienda Nube avise apenas se paga una venta, en vez de depender
// del export manual a Andreani para descontar stock.
export async function registerTnWebhook(storeId: number, accessToken: string): Promise<void> {
  const webhookUrl = process.env.TN_REDIRECT_URI
    ? new URL("/api/webhooks/tiendanube", new URL(process.env.TN_REDIRECT_URI).origin).toString()
    : null;
  if (!webhookUrl) {
    console.warn("[tnWebhooks] TN_REDIRECT_URI no configurado, no se puede registrar el webhook");
    return;
  }

  const headers = {
    "Authentication": `bearer ${accessToken}`,
    "User-Agent": "ShipFlow/1.0",
    "Content-Type": "application/json",
  };

  const listRes = await fetch(`${TN_API}/${storeId}/webhooks`, { headers });
  if (listRes.ok) {
    const existing = await listRes.json() as { event: string; url: string }[];
    const yaExiste = existing.some((w) => w.event === "order/paid" && w.url === webhookUrl);
    if (yaExiste) return;
  }

  const createRes = await fetch(`${TN_API}/${storeId}/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ event: "order/paid", url: webhookUrl }),
  });
  if (!createRes.ok) {
    console.error("[tnWebhooks] error registrando webhook:", await createRes.text());
  }
}
