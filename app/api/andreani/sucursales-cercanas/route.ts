import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { sucursalesCercanas } from "@/lib/andreaniLocator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/cambios");
  if (!guard.ok) return guard.response;

  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng inválidos" }, { status: 400 });
  }

  const sucursales = await sucursalesCercanas(lat, lng);
  return NextResponse.json({ sucursales });
}
