import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
import { readTokens } from "@/lib/tnTokens";
import { requireModule } from "@/lib/permissions";
import { initPedidoExtrasTables, getExtrasPorOrdenes } from "@/lib/pedidoExtrasDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  const tokens = readTokens();
  if (!tokens) return NextResponse.json({ error: "No hay tienda conectada" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Error al leer el archivo" }, { status: 400 });
  }

  const csvFile = formData.get("csv") as File | null;
  if (!csvFile) return NextResponse.json({ error: "Falta CSV" }, { status: 400 });

  const csvBuffer = Buffer.from(await csvFile.arrayBuffer());
  const csvB64    = csvBuffer.toString("base64");

  const scriptPath = path.join(process.cwd(), "scripts", "parse_sku_csv.py");
  const inputJson  = JSON.stringify({ csv_b64: csvB64 });

  for (const cmd of ["python", "python3"]) {
    const result = spawnSync(cmd, [scriptPath], {
      input: inputJson,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });
    if (result.error) continue;
    if (result.status !== 0) {
      const stderr = (result.stderr ?? "").trim();
      return NextResponse.json({ error: `Error Python: ${stderr}` }, { status: 500 });
    }
    const orders = JSON.parse((result.stdout ?? "").trim() || "{}") as
      Record<string, { nombre: string; skus: { sku: string; cantidad: number }[] }>;

    // Sumar los extras guardados a mano para cada pedido presente en el CSV.
    const storeId = String(tokens.user_id);
    await initPedidoExtrasTables();
    const extrasPorOrden = await getExtrasPorOrdenes(storeId, Object.keys(orders));
    for (const [orden, extras] of Object.entries(extrasPorOrden)) {
      if (!extras.length || !orders[orden]) continue;
      for (const extra of extras) {
        orders[orden].skus.push({ sku: extra.sku, cantidad: extra.cantidad });
      }
    }

    return NextResponse.json({ orders });
  }

  return NextResponse.json({ error: "Python no disponible" }, { status: 500 });
}
