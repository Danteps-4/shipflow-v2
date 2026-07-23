import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getValidMetaAccessToken } from "@/lib/metaTokens";
import { updateNodeBudget } from "@/lib/metaAdsClient";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "creativo", "/creativo");
  if (!guard.ok) return guard.response;

  const token = await getValidMetaAccessToken();
  if (!token) return NextResponse.json({ error: "No hay una cuenta de Meta conectada (o venció, reconectá)" }, { status: 400 });

  const { nodeId, field, monto } = await req.json() as { nodeId?: string; field?: string; monto?: number };
  if (!nodeId || (field !== "daily_budget" && field !== "lifetime_budget") || typeof monto !== "number" || monto <= 0) {
    return NextResponse.json({ error: "Faltan campos: nodeId, field (daily_budget|lifetime_budget), monto" }, { status: 400 });
  }

  try {
    await updateNodeBudget(token.accessToken, nodeId, field, monto);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[creativo/meta/node-budget]", e);
    return NextResponse.json({ error: "Error al actualizar el presupuesto en Meta" }, { status: 502 });
  }
}
