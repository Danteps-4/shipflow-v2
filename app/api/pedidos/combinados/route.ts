import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { requireModule } from "@/lib/permissions";
import {
  initPedidosCombinadosTables, reemplazarCombinados, GrupoCombinado,
} from "@/lib/pedidosCombinadosDb";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

// Body: { exportados: string[], grupos: GrupoCombinado[] }
// `exportados` son los números de pedido que salen en este Excel: sirve para
// limpiar combinaciones viejas de esos mismos pedidos antes de guardar las
// vigentes (ej. se deshizo una combinación y se volvió a exportar).
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/procesar");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No hay tienda conectada" }, { status: 401 });

  const body = await req.json() as { exportados?: unknown; grupos?: unknown };
  const exportados = Array.isArray(body.exportados) ? body.exportados.map(String) : [];
  const gruposRaw = Array.isArray(body.grupos) ? body.grupos : [];

  const grupos: GrupoCombinado[] = [];
  for (const g of gruposRaw as Partial<GrupoCombinado>[]) {
    if (!g?.principal || !Array.isArray(g.secundarias) || g.secundarias.length === 0) {
      return NextResponse.json({ error: "Grupo de pedidos combinados inválido" }, { status: 400 });
    }
    grupos.push({
      principal: String(g.principal),
      secundarias: g.secundarias.map(s => ({
        numeroOrden: String(s.numeroOrden),
        productos: Array.isArray(s.productos) ? s.productos : [],
      })),
    });
  }

  await initPedidosCombinadosTables();
  await reemplazarCombinados(storeId, exportados, grupos, guard.user.name);
  return NextResponse.json({ ok: true });
}
