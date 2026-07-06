import { getMlConexionByStoreId, updateMlTokens } from "./mlDb";

const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Devuelve un access_token vigente para la conexión ML de la tienda,
// refrescándolo si está por vencer. ML rota el refresh_token en cada
// refresh: hay que persistir el nuevo, el viejo queda invalidado.
export async function getValidMlAccessToken(storeId: string): Promise<string | null> {
  const conexion = await getMlConexionByStoreId(storeId);
  if (!conexion) return null;

  const expiresAt = new Date(conexion.expires_at).getTime();
  if (Date.now() < expiresAt - REFRESH_MARGIN_MS) {
    return conexion.access_token;
  }

  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ML_CLIENT_ID ?? "",
      client_secret: process.env.ML_CLIENT_SECRET ?? "",
      refresh_token: conexion.refresh_token,
    }),
  });

  if (!res.ok) {
    console.error("[mlTokens] refresh failed:", await res.text());
    return null;
  }

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
  await updateMlTokens(storeId, data.access_token, data.refresh_token, newExpiresAt);
  return data.access_token;
}
