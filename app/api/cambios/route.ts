import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import {
  initCambiosTables,
  getCambios,
  getCambioById,
  createCambio,
  updateCambio,
  marcarCambiosProcesados,
  deleteCambio,
  TipoCambio,
} from "@/lib/cambiosDb";
import { initFinanzasTables, createGastoNegocio, updateGastoNegocio, deleteGastoNegocio } from "@/lib/finanzasDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

const TIPOS_VALIDOS: TipoCambio[] = ["domicilio", "sucursal"];

interface CambioBody {
  nombre?: string; telefono?: string; email?: string; dni?: string; motivo?: string;
  numeroPedidoOriginal?: string;
  costo?: number | string | null;
  tipo?: TipoCambio;
  direccion?: string; numeroDireccion?: string; piso?: string; localidad?: string;
  provincia?: string; codigoPostal?: string; sucursal?: string;
}

function validarCambio(body: CambioBody): string | null {
  if (!body.nombre?.trim()) return "Falta nombre";
  if (!body.telefono?.trim()) return "Falta teléfono";
  if (!body.tipo || !TIPOS_VALIDOS.includes(body.tipo)) return "Tipo inválido";
  if (body.tipo === "sucursal" && !body.sucursal?.trim()) return "Falta la sucursal";
  if (body.tipo === "domicilio" && (!body.direccion?.trim() || !body.numeroDireccion?.trim())) {
    return "Falta calle y número";
  }
  return null;
}

function parseCosto(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Crea, actualiza o borra el gasto de "Gastos del negocio" (categoría
// "Envíos") vinculado a un cambio, según el costo cargado. Sin costo (o
// costo <= 0) borra el gasto que hubiera quedado vinculado antes.
async function sincronizarGasto(
  gastoIdExistente: number | null,
  costo: number | null,
  nombre: string,
  numeroPedidoOriginal: string | undefined,
  persona: string,
): Promise<number | null> {
  if (costo) {
    const detalle = `Cambio - ${nombre}${numeroPedidoOriginal ? ` - Pedido #${numeroPedidoOriginal}` : ""}`;
    if (gastoIdExistente) {
      await updateGastoNegocio(gastoIdExistente, { monto: costo, detalle, persona });
      return gastoIdExistente;
    }
    const gasto = await createGastoNegocio({
      fecha: new Date().toISOString().slice(0, 10),
      persona,
      categoria: "Envíos",
      detalle,
      cantidad: null,
      monto: costo,
      pagado: false,
    });
    return gasto.id;
  }
  if (gastoIdExistente) await deleteGastoNegocio(gastoIdExistente);
  return null;
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/cambios");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const procesadoParam = req.nextUrl.searchParams.get("procesado");
  const procesado = procesadoParam === null ? undefined : procesadoParam === "true";

  await initCambiosTables();
  const cambios = await getCambios(storeId, { procesado });
  return NextResponse.json({ cambios });
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/cambios");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as CambioBody;
  const error = validarCambio(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await initCambiosTables();
  await initFinanzasTables();

  const costo = parseCosto(body.costo);
  const gastoId = await sincronizarGasto(null, costo, body.nombre!.trim(), body.numeroPedidoOriginal, guard.user.name);

  const cambio = await createCambio(storeId, {
    nombre: body.nombre!.trim(), telefono: body.telefono!.trim(),
    email: body.email?.trim(), dni: body.dni?.trim(), motivo: body.motivo?.trim(),
    numeroPedidoOriginal: body.numeroPedidoOriginal?.trim(),
    costo, gastoId,
    tipo: body.tipo!,
    direccion: body.direccion, numeroDireccion: body.numeroDireccion, piso: body.piso,
    localidad: body.localidad, provincia: body.provincia, codigoPostal: body.codigoPostal,
    sucursal: body.sucursal,
    createdBy: guard.user.name,
  });
  return NextResponse.json({ cambio });
}

// Body: { id, marcarProcesados: number[] } marca una tanda de cambios como
// ya incluidos en un Excel exportado. { id, ...resto } edita un cambio
// existente (título/dirección/costo/etc, no el estado de procesado).
export async function PUT(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/cambios");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as { id?: number; marcarProcesados?: number[] } & CambioBody;

  if (body.marcarProcesados) {
    await initCambiosTables();
    await marcarCambiosProcesados(storeId, body.marcarProcesados);
    return NextResponse.json({ ok: true });
  }

  if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const error = validarCambio(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await initCambiosTables();
  await initFinanzasTables();

  const existing = await getCambioById(storeId, Number(body.id));
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const costo = parseCosto(body.costo);
  const gastoId = await sincronizarGasto(existing.gasto_id, costo, body.nombre!.trim(), body.numeroPedidoOriginal, guard.user.name);

  const cambio = await updateCambio(storeId, Number(body.id), {
    nombre: body.nombre!.trim(), telefono: body.telefono!.trim(),
    email: body.email?.trim(), dni: body.dni?.trim(), motivo: body.motivo?.trim(),
    numeroPedidoOriginal: body.numeroPedidoOriginal?.trim(),
    costo, gastoId,
    tipo: body.tipo!,
    direccion: body.direccion, numeroDireccion: body.numeroDireccion, piso: body.piso,
    localidad: body.localidad, provincia: body.provincia, codigoPostal: body.codigoPostal,
    sucursal: body.sucursal,
  });
  if (!cambio) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ cambio });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/cambios");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initCambiosTables();

  const existing = await getCambioById(storeId, Number(id));
  if (existing?.gasto_id) {
    await initFinanzasTables();
    await deleteGastoNegocio(existing.gasto_id);
  }

  const ok = await deleteCambio(storeId, Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
