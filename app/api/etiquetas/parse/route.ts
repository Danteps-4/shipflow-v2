import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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
    const orders = JSON.parse((result.stdout ?? "").trim() || "{}");
    return NextResponse.json({ orders });
  }

  return NextResponse.json({ error: "Python no disponible" }, { status: 500 });
}
