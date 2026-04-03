import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";

export const runtime = "nodejs";

function runPython(scriptPath: string, inputJson: string): { b64: string } | { error: string } {
  for (const cmd of ["python3", "python"]) {
    const result = spawnSync(cmd, [scriptPath], {
      input: inputJson,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30_000,
    });

    if (result.error) continue; // command not found, try next

    if (result.status !== 0) {
      const stderr = (result.stderr ?? "").trim();
      return { error: `Error en el script Python: ${stderr || `código ${result.status}`}` };
    }

    const b64 = (result.stdout ?? "").trim();
    if (!b64) return { error: "El script no generó ningún resultado" };
    return { b64 };
  }
  return { error: "Python no está instalado en el servidor (se requiere python3 con openpyxl)" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const templatePath = path
      .join(process.cwd(), "EnvioMasivoExcelPaquetes.xlsx")
      .replace(/\\/g, "/");

    const scriptPath = path
      .join(process.cwd(), "scripts", "generate_excel.py")
      .replace(/\\/g, "/");

    const input = JSON.stringify({ ...body, template_path: templatePath });

    const pyResult = runPython(scriptPath, input);
    if ("error" in pyResult) {
      console.error("[/api/export]", pyResult.error);
      return NextResponse.json({ error: pyResult.error }, { status: 500 });
    }

    const buffer = Buffer.from(pyResult.b64, "base64");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="andreani_pedidos.xlsx"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/export]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
