import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { initImportacionesTables, listarCompras, crearCompra, NuevaLineaInput } from "@/lib/importacionesDb";

export const runtime = "nodejs";

// Mismo helper que ya usa app/api/stock/route.ts: cae al store activo
// compartido del equipo si el usuario logueado no tiene conexión TN propia.
async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "importaciones", "/importaciones");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  await initImportacionesTables();
  // La grilla muestra el ledger completo, como el Excel — sin el tope de
  // 200 que tenía la vista de tabla vieja.
  const compras = await listarCompras(storeId, {
    q: sp.get("q") ?? undefined,
    desde: sp.get("desde") ?? undefined,
    hasta: sp.get("hasta") ?? undefined,
    soloPendientes: sp.get("soloPendientes") === "true",
    limit: 5000,
  });
  return NextResponse.json({ compras });
}

interface CompraBody {
  fechaCompra?: string;
  trackingNumber?: string;
  fechaLlegadaEstimada?: string | null;
  dap?: number | null; pague?: number | null; precioUsd?: number | null;
  declaro?: number | null; impuestos?: number | null; totalArs?: number | null;
  nota?: string;
  lineas?: { sku?: string; nombre?: string; cantidadEsperada?: number; unidadesPorCaja?: number | null }[];
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "importaciones", "/importaciones");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as CompraBody;
  if (!body.fechaCompra) {
    return NextResponse.json({ error: "Falta fecha de compra" }, { status: 400 });
  }
  // Sin líneas válidas se crea con una fila en blanco para completar desde
  // la grilla (ver crearCompra).
  const lineasValidas = (body.lineas ?? []).filter((l): l is NuevaLineaInput =>
    !!l.sku?.trim() && typeof l.cantidadEsperada === "number" && l.cantidadEsperada > 0,
  );

  await initImportacionesTables();
  try {
    const compra = await crearCompra({
      storeId, fechaCompra: body.fechaCompra, trackingNumber: body.trackingNumber?.trim() || null,
      fechaLlegadaEstimada: body.fechaLlegadaEstimada ?? null,
      dap: body.dap ?? null, pague: body.pague ?? null, precioUsd: body.precioUsd ?? null,
      declaro: body.declaro ?? null, impuestos: body.impuestos ?? null, totalArs: body.totalArs ?? null,
      nota: body.nota ?? "", createdBy: guard.user.name,
      lineas: lineasValidas.map(l => ({ sku: l.sku.trim().toUpperCase(), nombre: l.nombre, cantidadEsperada: l.cantidadEsperada, unidadesPorCaja: l.unidadesPorCaja ?? null })),
    });
    return NextResponse.json({ compra });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[importaciones] error al crear compra:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
