import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import path from "path";

export const runtime = "nodejs";

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

    const b64 = execSync(`python "${scriptPath}"`, {
      input,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50 MB
      timeout: 30_000,
    }).trim();

    const buffer = Buffer.from(b64, "base64");

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
