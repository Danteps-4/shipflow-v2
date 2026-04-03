import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const csvFile = formData.get("csv") as File;
    const pdfFile = formData.get("pdf") as File;

    if (!csvFile || !pdfFile) {
      return NextResponse.json({ error: "Falta CSV o PDF" }, { status: 400 });
    }

    const csvBuffer  = Buffer.from(await csvFile.arrayBuffer());
    const csvB64     = csvBuffer.toString("base64");
    const pdfBuffer  = Buffer.from(await pdfFile.arrayBuffer());
    const pdfB64     = pdfBuffer.toString("base64");

    const scriptPath = path.join(process.cwd(), "scripts", "add_sku_to_pdf.py");
    const input      = JSON.stringify({ csv_b64: csvB64, pdf_b64: pdfB64 });

    const b64Result = execSync(`python "${scriptPath}"`, {
      input,
      encoding: "utf-8",
      maxBuffer: 100 * 1024 * 1024, // 100 MB
    }).trim();

    const resultBuffer = Buffer.from(b64Result, "base64");

    return new NextResponse(resultBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="etiquetas_con_sku.pdf"`,
      },
    });
  } catch (err) {
    console.error("Error generando etiquetas:", err);
    return NextResponse.json({ error: "Error al procesar el PDF" }, { status: 500 });
  }
}
