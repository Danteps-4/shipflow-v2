import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { initTicketsTables, addComentario } from "@/lib/ticketsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireModule(req, "tickets", "/tickets");
  if (!guard.ok) return guard.response;

  const { texto } = await req.json() as { texto?: string };
  if (!texto?.trim()) return NextResponse.json({ error: "Falta el texto" }, { status: 400 });

  await initTicketsTables();
  const comentario = await addComentario(Number(params.id), texto.trim(), guard.user.name);
  return NextResponse.json({ comentario });
}
