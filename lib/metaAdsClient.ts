const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface AdInsight {
  adId: string;
  adName: string;
  entrega: string;
  gasto: number;
  impresiones: number;
  clics: number;
  ctr: number;
  agregadosCarrito: number;
  pagosIniciados: number;
  compras: number;
  valorCompras: number;
  roas: number;
}

interface RawAction {
  action_type: string;
  value: string;
}

interface RawInsightRow {
  ad_id: string;
  ad_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
  purchase_roas?: RawAction[];
}

// Meta suele exponer una variante "omni_*" (cuenta web + app + offline) y la
// variante simple (solo web) para la misma acción. Se prefiere la "omni_"
// cuando está, para no sumar las dos y duplicar el conteo.
function pickAction(actions: RawAction[] | undefined, tiposEnOrdenDePreferencia: string[]): number {
  if (!actions) return 0;
  for (const tipo of tiposEnOrdenDePreferencia) {
    const found = actions.find(a => a.action_type === tipo);
    if (found) return Number(found.value);
  }
  return 0;
}

export async function getAdInsights(
  accessToken: string, adAccountId: string, desde: string, hasta: string,
): Promise<AdInsight[]> {
  const insightsUrl = new URL(`${META_GRAPH_URL}/act_${adAccountId}/insights`);
  insightsUrl.searchParams.set("level", "ad");
  insightsUrl.searchParams.set("fields", "ad_id,ad_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas");
  insightsUrl.searchParams.set("time_range", JSON.stringify({ since: desde, until: hasta }));
  insightsUrl.searchParams.set("limit", "200");
  insightsUrl.searchParams.set("access_token", accessToken);

  const res = await fetch(insightsUrl.toString());
  if (!res.ok) throw new Error(`Meta insights error: ${res.status} ${await res.text()}`);
  const { data } = await res.json() as { data: RawInsightRow[] };

  // El estado de entrega es un campo del anuncio, no de insights.
  const entregaPorAdId = new Map<string, string>();
  try {
    const adsUrl = new URL(`${META_GRAPH_URL}/act_${adAccountId}/ads`);
    adsUrl.searchParams.set("fields", "id,effective_status");
    adsUrl.searchParams.set("limit", "500");
    adsUrl.searchParams.set("access_token", accessToken);
    const adsRes = await fetch(adsUrl.toString());
    if (adsRes.ok) {
      const { data: ads } = await adsRes.json() as { data: { id: string; effective_status: string }[] };
      for (const a of ads) entregaPorAdId.set(a.id, a.effective_status);
    }
  } catch { /* la entrega es informativa; si falla, se muestra sin ella */ }

  return data
    .map(row => ({
      adId: row.ad_id,
      adName: row.ad_name,
      entrega: entregaPorAdId.get(row.ad_id) ?? "—",
      gasto: Number(row.spend ?? 0),
      impresiones: Number(row.impressions ?? 0),
      clics: Number(row.clicks ?? 0),
      ctr: Number(row.ctr ?? 0),
      agregadosCarrito: pickAction(row.actions, ["omni_add_to_cart", "add_to_cart"]),
      pagosIniciados: pickAction(row.actions, ["omni_initiated_checkout", "initiate_checkout"]),
      compras: pickAction(row.actions, ["omni_purchase", "purchase"]),
      valorCompras: pickAction(row.action_values, ["omni_purchase", "purchase"]),
      roas: row.purchase_roas?.[0] ? Number(row.purchase_roas[0].value) : 0,
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

export async function getAdAccountName(accessToken: string, adAccountId: string): Promise<string> {
  const url = new URL(`${META_GRAPH_URL}/act_${adAccountId}`);
  url.searchParams.set("fields", "name");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) return `Cuenta ${adAccountId}`;
  const data = await res.json() as { name?: string };
  return data.name ?? `Cuenta ${adAccountId}`;
}
