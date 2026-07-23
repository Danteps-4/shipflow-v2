import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
import { requireModule } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/etiquetas");
  if (!guard.ok) return guard.response;

  // Parse form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("[etiquetas] formData error:", err);
    return NextResponse.json({ error: "Error al leer los archivos enviados" }, { status: 400 });
  }

  const csvFile    = formData.get("csv")     as File   | null;
  const pdfFile    = formData.get("pdf")     as File   | null;
  const skuMapStr  = formData.get("sku_map") as string | null;

  if (!pdfFile) {
    return NextResponse.json({ error: "Falta PDF" }, { status: 400 });
  }
  if (!csvFile && !skuMapStr) {
    return NextResponse.json({ error: "Falta CSV o mapa de SKUs" }, { status: 400 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
  } catch (err) {
    console.error("[etiquetas] buffer error:", err);
    return NextResponse.json({ error: "Error al leer los archivos" }, { status: 400 });
  }

  const pdfB64 = pdfBuffer.toString("base64");

  // Build Python input: use pre-built sku_map if provided, else send CSV for server-side parsing
  const pyInput: Record<string, unknown> = { pdf_b64: pdfB64 };
  if (skuMapStr) {
    pyInput.sku_map = JSON.parse(skuMapStr);
  } else {
    const csvBuffer = Buffer.from(await csvFile!.arrayBuffer());
    pyInput.csv_b64 = csvBuffer.toString("base64");
  }

  const scriptPath = path.join(process.cwd(), "scripts", "add_sku_to_pdf.py");
  const inputJson  = JSON.stringify(pyInput);

  // Try python, then python3
  let b64Result: string | null = null;
  let lastError = "";

  for (const cmd of ["python", "python3"]) {
    const result = spawnSync(cmd, [scriptPath], {
      input: inputJson,
      encoding: "utf-8",
      maxBuffer: 100 * 1024 * 1024,
      timeout: 120_000,
    });

    if (result.error) {
      lastError = `${cmd}: ${result.error.message}`;
      continue; // try next command
    }

    if (result.status !== 0) {
      const stderr = (result.stderr ?? "").trim();
      lastError = `${cmd} exit ${result.status}: ${stderr}`;
      console.error("[etiquetas] script error:", lastError);
      return NextResponse.json(
        { error: `Error en el script Python: ${stderr || `código ${result.status}`}` },
        { status: 500 },
      );
    }

    b64Result = (result.stdout ?? "").trim();
    break;
  }

  if (b64Result === null) {
    console.error("[etiquetas] Python not found:", lastError);
    return NextResponse.json(
      { error: "Python no está instalado en el servidor. Instale Python con pandas, PyPDF2 y reportlab." },
      { status: 500 },
    );
  }

  if (!b64Result) {
    console.error("[etiquetas] script returned empty output");
    return NextResponse.json(
      { error: "El script no generó ningún resultado. Verifique que el PDF sea válido." },
      { status: 500 },
    );
  }

  const resultBuffer = Buffer.from(b64Result, "base64");

  return new NextResponse(resultBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="etiquetas_con_sku.pdf"`,
    },
  });
}
