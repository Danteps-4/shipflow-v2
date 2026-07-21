import { getMetaConexion, updateMetaToken } from "./metaDb";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";
const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000; // renovar si faltan menos de 7 días

export interface MetaToken {
  accessToken: string;
  adAccountId: string;
}

// Meta no tiene refresh_token: un token largo (~60 días) se "renueva"
// volviendo a canjearlo por sí mismo antes de que venza. Si ya venció,
// no hay forma de recuperarlo sin repetir el login OAuth completo.
export async function getValidMetaAccessToken(): Promise<MetaToken | null> {
  const conexion = await getMetaConexion();
  if (!conexion) return null;

  const expiresAt = new Date(conexion.token_expires_at).getTime();
  if (Date.now() >= expiresAt) return null;

  if (Date.now() < expiresAt - REFRESH_MARGIN_MS) {
    return { accessToken: conexion.access_token, adAccountId: conexion.ad_account_id };
  }

  const url = new URL(`${META_GRAPH_URL}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  url.searchParams.set("client_secret", process.env.META_APP_SECRET ?? "");
  url.searchParams.set("fb_exchange_token", conexion.access_token);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error("[metaTokens] renovación falló:", await res.text());
    // El token actual todavía es válido (no venció), seguimos usándolo.
    return { accessToken: conexion.access_token, adAccountId: conexion.ad_account_id };
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
  await updateMetaToken(conexion.ad_account_id, data.access_token, newExpiresAt);
  return { accessToken: data.access_token, adAccountId: conexion.ad_account_id };
}
