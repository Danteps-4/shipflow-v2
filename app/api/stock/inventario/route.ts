import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import { conTransaccion, inventarioV2Activo, asegurarEsquemaInventario } from "@/lib/inventarioTx";
import {
  getInventario, listarRecuentos, crearRecuento, resolverRecuento, ingresarDevolucion, moverEntreEstados, EstadoStock,
} from "@/lib/inventario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Estados de stock (reservado, defectuoso, en revisión), devoluciones y
// recuentos con aprobación. Solo existe con el motor de inventario nuevo
// prendido (INVENTARIO_V2=1); apagado, estas rutas responden como si no
// estuvieran.

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  return tokens ? String(tokens.user_id) : null;
}

const ESTADOS: EstadoStock[] = ["apto", "defectuoso", "revision"];

function errorNegocio(e: unknown) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "stock", "/stock");
  if (!guard.ok) return guard.response;
  if (!inventarioV2Activo()) return NextResponse.json({ activo: false });

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const data = await conTransaccion(async db => {
    await asegurarEsquemaInventario(db);
    return {
      items: await getInventario(db, storeId),
      pendientes: await listarRecuentos(db, storeId, "pendiente"),
      resueltos: (await listarRecuentos(db, storeId)).filter(r => r.estado !== "pendiente").slice(0, 15),
    };
  });
  return NextResponse.json({ activo: true, puedeAprobar: guard.user.role === "admin", ...data });
}

// Body: { accion: "devolucion" | "mover" | "recuento", sku, ... }
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "stock", "/stock");
  if (!guard.ok) return guard.response;
  if (!inventarioV2Activo()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const b = await req.json() as {
    accion?: string; sku?: string; cantidad?: number; cantidadContada?: number; de?: string; a?: string; motivo?: string;
  };
  const sku = String(b.sku ?? "").trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "Falta el SKU" }, { status: 400 });
  const usuario = guard.user.name;
  const motivo = String(b.motivo ?? "").trim();

  try {
    if (b.accion === "devolucion") {
      await conTransaccion(async db => {
        await asegurarEsquemaInventario(db);
        await ingresarDevolucion(db, { storeId, sku, cantidad: Number(b.cantidad), referencia: motivo || "manual", eventId: `devolucion:manual:${crypto.randomUUID()}`, usuario });
      });
    } else if (b.accion === "mover") {
      if (!ESTADOS.includes(b.de as EstadoStock) || !ESTADOS.includes(b.a as EstadoStock)) {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      }
      if (!motivo) return NextResponse.json({ error: "Indicá el motivo" }, { status: 400 });
      await conTransaccion(async db => {
        await asegurarEsquemaInventario(db);
        await moverEntreEstados(db, { storeId, sku, cantidad: Number(b.cantidad), de: b.de as EstadoStock, a: b.a as EstadoStock, motivo, usuario });
      });
    } else if (b.accion === "recuento") {
      const rec = await conTransaccion(async db => {
        await asegurarEsquemaInventario(db);
        return crearRecuento(db, { storeId, sku, cantidadContada: Number(b.cantidadContada), motivo, usuario });
      });
      return NextResponse.json({ recuento: rec });
    } else {
      return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorNegocio(e);
  }
}

// Body: { id, resolucion: "aprobar" | "rechazar", motivo? } — solo administradores.
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "stock", "/stock");
  if (!guard.ok) return guard.response;
  if (!inventarioV2Activo()) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  if (guard.user.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede aprobar o rechazar un recuento" }, { status: 403 });
  }

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const b = await req.json() as { id?: number; resolucion?: string; motivo?: string };
  if (!b.id || (b.resolucion !== "aprobar" && b.resolucion !== "rechazar")) {
    return NextResponse.json({ error: "Faltan datos: id y resolucion" }, { status: 400 });
  }
  try {
    const recuento = await conTransaccion(db => resolverRecuento(db, {
      storeId, id: Number(b.id), resolucion: b.resolucion as "aprobar" | "rechazar", usuario: guard.user.name, motivo: b.motivo,
    }));
    return NextResponse.json({ recuento });
  } catch (e) {
    return errorNegocio(e);
  }
}
