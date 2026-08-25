import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
import { requireModule } from "@/lib/permissions";
import { readTokens } from "@/lib/tnTokens";
import { initDepositoTables, createEtiquetaDeposito } from "@/lib/depositoDb";
import { uploadBuffer } from "@/lib/cloudinary";

export const runtime = "nodejs";

// Ver el comentario equivalente en app/api/etiquetas/route.ts: copia
// best-effort al módulo de Depósito, no debe romper la descarga principal.
async function copiarADeposito(sfUserId: string, createdBy: string, buffer: Buffer) {
  try {
    const tokens = readTokens(sfUserId);
    if (!tokens) return;
    const storeId = String(tokens.user_id);

    const { url, publicId } = await uploadBuffer(buffer, "shipflow-deposito", "pdf");
    await initDepositoTables();
    const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    await createEtiquetaDeposito(storeId, {
      origen: "mercado_libre",
      titulo: `Etiquetas ML · ${fecha}`,
      url,
      publicId,
      createdBy,
    });
  } catch (e) {
    console.error("[etiquetas-ml] no se pudo copiar a Depósito:", e);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "mercadolibre", "/etiquetas-ml");
  if (!guard.ok) return guard.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("[etiquetas-ml] formData error:", err);
    return NextResponse.json({ error: "Error al leer el archivo enviado" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Falta el archivo ZIP o TXT" }, { status: 400 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    console.error("[etiquetas-ml] buffer error:", err);
    return NextResponse.json({ error: "Error al leer el archivo" }, { status: 400 });
  }

  const fileB64 = fileBuffer.toString("base64");
  const scriptPath = path.join(process.cwd(), "scripts", "zpl_to_pdf.py");
  const inputJson = JSON.stringify({ file_b64: fileB64, filename: file.name });

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
      continue;
    }

    if (result.status !== 0) {
      const stderr = (result.stderr ?? "").trim();
      lastError = `${cmd} exit ${result.status}: ${stderr}`;
      console.error("[etiquetas-ml] script error:", lastError);
      return NextResponse.json(
        { error: stderr || `Error en el script Python (código ${result.status})` },
        { status: 500 },
      );
    }

    b64Result = (result.stdout ?? "").trim();
    break;
  }

  if (b64Result === null) {
    console.error("[etiquetas-ml] Python not found:", lastError);
    return NextResponse.json(
      { error: "Python no está instalado en el servidor." },
      { status: 500 },
    );
  }

  if (!b64Result) {
    console.error("[etiquetas-ml] script returned empty output");
    return NextResponse.json(
      { error: "El script no generó ningún resultado. Verifique que el archivo sea válido." },
      { status: 500 },
    );
  }

  const resultBuffer = Buffer.from(b64Result, "base64");

  await copiarADeposito(guard.user.id, guard.user.name, resultBuffer);

  return new NextResponse(resultBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="etiquetas_ml.pdf"`,
    },
  });
}
