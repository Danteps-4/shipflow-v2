import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import {
  initFinanzasTables,
  getTransferenciasActivas,
  getTransferenciasPorCierre,
  createTransferencia,
  updateTransferencia,
  deleteTransferencia,
} from "@/lib/finanzasDb";
import { destroyAsset } from "@/lib/cloudinary";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  return String(tokens.user_id);
}

// GET ?cierreId=123 trae las transferencias de ese cierre (historial).
// Sin cierreId trae las activas (todavía sin cerrar).
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await initFinanzasTables();
  const cierreIdParam = req.nextUrl.searchParams.get("cierreId");
  const transferencias = cierreIdParam
    ? await getTransferenciasPorCierre(storeId, Number(cierreIdParam))
    : await getTransferenciasActivas(storeId);
  return NextResponse.json({ transferencias });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { monto, comprobanteUrl, comprobantePublicId, enviada, recibida } = await req.json();
  const montoNum = Number(monto);
  if (!montoNum || montoNum <= 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }

  await initFinanzasTables();
  const transferencia = await createTransferencia(storeId, {
    monto: montoNum,
    comprobanteUrl: comprobanteUrl ?? null,
    comprobantePublicId: comprobantePublicId ?? null,
    enviada: !!enviada,
    recibida: !!recibida,
    createdBy: guard.user.name,
  });
  return NextResponse.json({ transferencia });
}

// Body: { id, monto?, enviada?, recibida? } — para tildar enviada/recibida
// o corregir el monto, incluso en transferencias de un día ya cerrado.
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id, monto, enviada, recibida } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const transferencia = await updateTransferencia(storeId, Number(id), {
    monto: monto !== undefined ? Number(monto) : undefined,
    enviada, recibida,
  });
  if (!transferencia) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ transferencia });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "finanzas");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initFinanzasTables();
  const borrada = await deleteTransferencia(storeId, Number(id));
  if (!borrada) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  if (borrada.comprobante_public_id) {
    await destroyAsset(borrada.comprobante_public_id, "image").catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
