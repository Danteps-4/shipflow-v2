import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Parse form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("[etiquetas] formData error:", err);
    return NextResponse.json({ error: "Error al leer los archivos enviados" }, { status: 400 });
  }

  const csvFile = formData.get("csv") as File | null;
  const pdfFile = formData.get("pdf") as File | null;

  if (!csvFile || !pdfFile) {
    return NextResponse.json({ error: "Falta CSV o PDF" }, { status: 400 });
  }

  let csvBuffer: Buffer;
  let pdfBuffer: Buffer;
  try {
    csvBuffer = Buffer.from(await csvFile.arrayBuffer());
    pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
  } catch (err) {
    console.error("[etiquetas] buffer error:", err);
    return NextResponse.json({ error: "Error al leer los archivos" }, { status: 400 });
  }

  const csvB64 = csvBuffer.toString("base64");
  const pdfB64 = pdfBuffer.toString("base64");

  const scriptPath = path.join(process.cwd(), "scripts", "add_sku_to_pdf.py");
  const inputJson  = JSON.stringify({ csv_b64: csvB64, pdf_b64: pdfB64 });

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
