import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
// Se importa el módulo interno (no "pdf-parse" a secas): el index.js del
// paquete detecta si corre standalone via `!module.parent` y en ese caso
// intenta leer un PDF de prueba de su propio repo — bajo el bundling de
// Next.js esa detección da un falso positivo y rompe el import.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { requireModule } from "@/lib/permissions";

export const runtime = "nodejs";

// Si el interno es puramente numérico se normaliza (saca ceros a la
// izquierda, etc); si no (ej. "CAMBIO-21", que es como Andreani imprime
// los envíos cargados desde la pestaña Cambios) se devuelve tal cual.
function normalizarNro(valor: string): string {
  return /^\d+$/.test(valor) ? String(Number(valor)) : valor.toUpperCase();
}

// Extrae el número de pedido/interno impreso en el texto de una página de
// etiqueta (Andreani o Envío Nube). Usado por el fallback en Node.
function extraerNro(texto: string): string | null {
  const t = texto.replace(/N[ÂºO]°?/gi, "N°").replace(/\n/g, " ");
  // "N° Interno" puede ser un número de pedido normal ("#12345") o, para
  // envíos cargados desde Cambios, el literal "CAMBIO-<id>" — no siempre
  // son solo dígitos.
  let m = t.match(/Interno\s*:\s*#?\s*([A-Za-z0-9-]+)/i);
  if (m) return normalizarNro(m[1]);
  m = t.match(/Para\s*:\s*#(\d+)/i);
  if (m) return normalizarNro(m[1]);
  m = t.match(/#(\d+)/);
  if (m) return normalizarNro(m[1]);
  return null;
}

// Intenta con el script de Python (PyPDF2, más tolerante con PDFs raros o
// mal formados que suelen generar los sistemas de impresión de etiquetas)
// probando distintos comandos, porque "python" no siempre está en el PATH
// de la misma forma en todas las máquinas Windows (a veces resuelve al
// stub de Microsoft Store en vez del intérprete real).
function tryPython(pdfB64: string): { orderNumbers: string[] } | null {
  const scriptPath = path.join(process.cwd(), "scripts", "extract_pdf_orders.py");
  const inputJson  = JSON.stringify({ pdf_b64: pdfB64 });

  for (const cmd of ["python", "python3", "py"]) {
    const result = spawnSync(cmd, [scriptPath], {
      input: inputJson,
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60_000,
    });
    if (result.error || result.status !== 0) continue;
    try {
      return JSON.parse((result.stdout ?? "").trim() || '{"orderNumbers":[]}');
    } catch { continue; }
  }
  return null;
}

// Fallback en Node puro (sin depender de que Python esté instalado): usa
// pdf-parse, algo más estricto que PyPDF2 con PDFs mal formados, pero no
// depende de nada externo a la app.
async function tryNode(pdfBuffer: Buffer): Promise<{ orderNumbers: string[] } | null> {
  try {
    const orders: string[] = [];
    const seen = new Set<string>();
    const { text } = await pdfParse(pdfBuffer);
    for (const pageText of text.split("\f")) {
      const nro = extraerNro(pageText);
      if (nro && !seen.has(nro)) {
        seen.add(nro);
        orders.push(nro);
      }
    }
    return { orderNumbers: orders };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "pedidos", "/etiquetas");
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

  // Se prueban los dos métodos y se prefiere el que haya encontrado algo,
  // por si uno de los dos falla en detectar el patrón en un PDF particular.
  const viaPython = tryPython(pdfBuffer.toString("base64"));
  if (viaPython?.orderNumbers.length) return NextResponse.json(viaPython);

  const viaNode = await tryNode(pdfBuffer);
  if (viaNode?.orderNumbers.length) return NextResponse.json(viaNode);

  if (viaPython) return NextResponse.json(viaPython);
  if (viaNode) return NextResponse.json(viaNode);

  return NextResponse.json({ error: "No se pudo leer el PDF con ninguno de los métodos disponibles" }, { status: 500 });
}
