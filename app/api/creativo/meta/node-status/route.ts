import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getValidMetaAccessToken } from "@/lib/metaTokens";
import { updateNodeStatus } from "@/lib/metaAdsClient";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) return guard.response;

  const token = await getValidMetaAccessToken();
  if (!token) return NextResponse.json({ error: "No hay una cuenta de Meta conectada (o venció, reconectá)" }, { status: 400 });

  const { nodeId, status } = await req.json() as { nodeId?: string; status?: string };
  if (!nodeId || (status !== "ACTIVE" && status !== "PAUSED")) {
    return NextResponse.json({ error: "Faltan campos: nodeId, status (ACTIVE|PAUSED)" }, { status: 400 });
  }

  try {
    await updateNodeStatus(token.accessToken, nodeId, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[creativo/meta/node-status]", e);
    return NextResponse.json({ error: "Error al actualizar el estado en Meta" }, { status: 502 });
  }
}
