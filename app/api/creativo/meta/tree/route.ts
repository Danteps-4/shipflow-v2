import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getValidMetaAccessToken } from "@/lib/metaTokens";
import { getCampaignTree } from "@/lib/metaAdsClient";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) return guard.response;

  const token = await getValidMetaAccessToken();
  if (!token) return NextResponse.json({ error: "No hay una cuenta de Meta conectada (o venció, reconectá)" }, { status: 400 });

  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const desde = req.nextUrl.searchParams.get("desde") ?? hace7;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? hoy;

  try {
    const campaigns = await getCampaignTree(token.accessToken, token.adAccountId, desde, hasta);
    return NextResponse.json({ campaigns, desde, hasta });
  } catch (e) {
    console.error("[creativo/meta/tree]", e);
    return NextResponse.json({ error: "Error al consultar Meta" }, { status: 502 });
  }
}
