const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface MetaMetricas {
  gasto: number;
  impresiones: number;
  alcance: number;
  clics: number;
  ctr: number;
  agregadosCarrito: number;
  pagosIniciados: number;
  compras: number;
  valorCompras: number;
  roas: number;
}

export interface MetaNode extends MetaMetricas {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}

export type AdNode = MetaNode;
export interface AdSetNode extends MetaNode { ads: AdNode[] }
export interface CampaignNode extends MetaNode { adsets: AdSetNode[] }

interface RawAction {
  action_type: string;
  value: string;
}

interface RawStructNode {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  campaign_id?: string;
  adset_id?: string;
}

interface RawInsightRow {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
  purchase_roas?: RawAction[];
}

const METRICAS_VACIAS: MetaMetricas = {
  gasto: 0, impresiones: 0, alcance: 0, clics: 0, ctr: 0,
  agregadosCarrito: 0, pagosIniciados: 0, compras: 0, valorCompras: 0, roas: 0,
};

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

function metricasDesdeInsight(row: RawInsightRow | undefined): MetaMetricas {
  if (!row) return { ...METRICAS_VACIAS };
  return {
    gasto: Number(row.spend ?? 0),
    impresiones: Number(row.impressions ?? 0),
    alcance: Number(row.reach ?? 0),
    clics: Number(row.clicks ?? 0),
    ctr: Number(row.ctr ?? 0),
    agregadosCarrito: pickAction(row.actions, ["omni_add_to_cart", "add_to_cart"]),
    pagosIniciados: pickAction(row.actions, ["omni_initiated_checkout", "initiate_checkout"]),
    compras: pickAction(row.actions, ["omni_purchase", "purchase"]),
    valorCompras: pickAction(row.action_values, ["omni_purchase", "purchase"]),
    roas: row.purchase_roas?.[0] ? Number(row.purchase_roas[0].value) : 0,
  };
}

async function fetchList<T>(url: URL): Promise<T[]> {
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta API error: ${res.status} ${await res.text()}`);
  const { data } = await res.json() as { data: T[] };
  return data;
}

function insightsUrl(adAccountId: string, level: "campaign" | "adset" | "ad", idField: string, desde: string, hasta: string): URL {
  const url = new URL(`${META_GRAPH_URL}/act_${adAccountId}/insights`);
  url.searchParams.set("level", level);
  url.searchParams.set("fields", `${idField},spend,impressions,reach,clicks,ctr,actions,action_values,purchase_roas`);
  url.searchParams.set("time_range", JSON.stringify({ since: desde, until: hasta }));
  url.searchParams.set("limit", "500");
  return url;
}

// Centavos de la moneda de la cuenta → monto real (asume 2 decimales, válido
// para ARS/USD y la mayoría de las monedas que usa esta cuenta).
function centavosAMonto(v: string | undefined): number | null {
  if (v === undefined) return null;
  return Number(v) / 100;
}

export async function getCampaignTree(
  accessToken: string, adAccountId: string, desde: string, hasta: string,
): Promise<CampaignNode[]> {
  const withToken = (u: URL) => { u.searchParams.set("access_token", accessToken); return u; };

  const [campaigns, adsets, ads, campaignInsights, adsetInsights, adInsights] = await Promise.all([
    fetchList<RawStructNode>(withToken(new URL(`${META_GRAPH_URL}/act_${adAccountId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=200`))),
    fetchList<RawStructNode>(withToken(new URL(`${META_GRAPH_URL}/act_${adAccountId}/adsets?fields=id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget&limit=500`))),
    fetchList<RawStructNode>(withToken(new URL(`${META_GRAPH_URL}/act_${adAccountId}/ads?fields=id,name,adset_id,campaign_id,status,effective_status&limit=500`))),
    fetchList<RawInsightRow>(withToken(insightsUrl(adAccountId, "campaign", "campaign_id", desde, hasta))),
    fetchList<RawInsightRow>(withToken(insightsUrl(adAccountId, "adset", "adset_id", desde, hasta))),
    fetchList<RawInsightRow>(withToken(insightsUrl(adAccountId, "ad", "ad_id", desde, hasta))),
  ]);

  const campaignInsightsById = new Map(campaignInsights.map(r => [r.campaign_id!, r]));
  const adsetInsightsById    = new Map(adsetInsights.map(r => [r.adset_id!, r]));
  const adInsightsById       = new Map(adInsights.map(r => [r.ad_id!, r]));

  const adsByAdsetId = new Map<string, AdNode[]>();
  for (const raw of ads) {
    const node: AdNode = {
      id: raw.id,
      name: raw.name,
      status: raw.status,
      effectiveStatus: raw.effective_status,
      dailyBudget: null,
      lifetimeBudget: null,
      ...metricasDesdeInsight(adInsightsById.get(raw.id)),
    };
    const adsetId = raw.adset_id ?? "";
    if (!adsByAdsetId.has(adsetId)) adsByAdsetId.set(adsetId, []);
    adsByAdsetId.get(adsetId)!.push(node);
  }

  const adsetsByCampaignId = new Map<string, AdSetNode[]>();
  for (const raw of adsets) {
    const node: AdSetNode = {
      id: raw.id,
      name: raw.name,
      status: raw.status,
      effectiveStatus: raw.effective_status,
      dailyBudget: centavosAMonto(raw.daily_budget),
      lifetimeBudget: centavosAMonto(raw.lifetime_budget),
      ads: (adsByAdsetId.get(raw.id) ?? []).sort((a, b) => b.gasto - a.gasto),
      ...metricasDesdeInsight(adsetInsightsById.get(raw.id)),
    };
    const campaignId = raw.campaign_id ?? "";
    if (!adsetsByCampaignId.has(campaignId)) adsetsByCampaignId.set(campaignId, []);
    adsetsByCampaignId.get(campaignId)!.push(node);
  }

  return campaigns
    .map((raw): CampaignNode => ({
      id: raw.id,
      name: raw.name,
      status: raw.status,
      effectiveStatus: raw.effective_status,
      dailyBudget: centavosAMonto(raw.daily_budget),
      lifetimeBudget: centavosAMonto(raw.lifetime_budget),
      adsets: (adsetsByCampaignId.get(raw.id) ?? []).sort((a, b) => b.gasto - a.gasto),
      ...metricasDesdeInsight(campaignInsightsById.get(raw.id)),
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

export async function updateNodeStatus(accessToken: string, nodeId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  const url = new URL(`${META_GRAPH_URL}/${nodeId}`);
  url.searchParams.set("status", status);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) throw new Error(`Meta update status error: ${res.status} ${await res.text()}`);
}

export async function updateNodeBudget(
  accessToken: string, nodeId: string, field: "daily_budget" | "lifetime_budget", montoReal: number,
): Promise<void> {
  const url = new URL(`${META_GRAPH_URL}/${nodeId}`);
  url.searchParams.set(field, String(Math.round(montoReal * 100)));
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) throw new Error(`Meta update budget error: ${res.status} ${await res.text()}`);
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
