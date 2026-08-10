import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { buscarDirecciones } from "@/lib/andreaniLocator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/cambios");
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const direcciones = await buscarDirecciones(q);
  return NextResponse.json({ direcciones });
}
