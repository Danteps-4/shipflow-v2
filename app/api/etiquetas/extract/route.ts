import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
import { requireModule } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos");
  if (!guard.ok) return guard.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Error al leer el archivo" }, { status: 400 });
  }

  const pdfFile = formData.get("pdf") as File | null;
  if (!pdfFile) return NextResponse.json({ error: "Falta PDF" }, { status: 400 });

  const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
  const pdfB64    = pdfBuffer.toString("base64");

  const scriptPath = path.join(process.cwd(), "scripts", "extract_pdf_orders.py");
  const inputJson  = JSON.stringify({ pdf_b64: pdfB64 });

  for (const cmd of ["python", "python3"]) {
    const result = spawnSync(cmd, [scriptPath], {
      input: inputJson,
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60_000,
    });
    if (result.error) continue;
    if (result.status !== 0) {
      const stderr = (result.stderr ?? "").trim();
      return NextResponse.json({ error: `Error Python: ${stderr}` }, { status: 500 });
    }
    return NextResponse.json(JSON.parse((result.stdout ?? "").trim() || '{"orderNumbers":[]}'));
  }

  return NextResponse.json({ error: "Python no disponible" }, { status: 500 });
}
