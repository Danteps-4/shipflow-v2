import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import {
  initFinanzasTables,
  getCategoriasGastoNegocio,
  createCategoriaGastoNegocio,
  updateCategoriaGastoNegocio,
  deleteCategoriaGastoNegocio,
} from "@/lib/finanzasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Categorías de gastos del negocio: son de la cuenta en general, igual que
// los gastos que categorizan.

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  await initFinanzasTables();
  const categorias = await getCategoriasGastoNegocio();
  return NextResponse.json({ categorias });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  const { nombre, color } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  await initFinanzasTables();
  try {
    const categoria = await createCategoriaGastoNegocio(nombre.trim(), color || "#6b7280");
    return NextResponse.json({ categoria });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  const { id, nombre, color } = await req.json();
  if (!id || !nombre?.trim()) return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });

  await initFinanzasTables();
  try {
    const categoria = await updateCategoriaGastoNegocio(Number(id), nombre.trim(), color || "#6b7280");
    if (!categoria) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ categoria });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "finanzas", "/finanzas");
  if (!guard.ok) return guard.response;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  await deleteCategoriaGastoNegocio(Number(id));
  return NextResponse.json({ ok: true });
}
