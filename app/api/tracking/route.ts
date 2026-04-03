import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { spawnSync } from "child_process";
import path from "path";

export const runtime = "nodejs";

interface TrackingEntry { order: string; tracking: string; }
interface TrackingResult extends TrackingEntry {
  status: "success" | "error" | "skipped";
  detail?: string;
}

// ── Tienda Nube API helpers ──────────────────────────────────────

function tnHeaders(token: string) {
  return {
    "Authentication": `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "ShipFlow/1.0",
  };
}

async function lookupRealId(storeId: number, token: string, orderNumber: string): Promise<number> {
  const url = `https://api.tiendanube.com/v1/${storeId}/orders?q=${orderNumber}`;
  const res = await fetch(url, { headers: tnHeaders(token) });
  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data[0]) throw new Error(`Order ${orderNumber} not found`);
  return data[0].id;
}

async function getFulfillmentId(storeId: number, token: string, realId: number): Promise<string> {
  const url = `https://api.tiendanube.com/v1/${storeId}/orders/${realId}`;
  const res = await fetch(url, { headers: tnHeaders(token) });
  if (!res.ok) throw new Error(`Get order failed: ${res.status}`);
  const order = await res.json();
  const fulfillments: unknown[] = order.fulfillments ?? order.fulfillment_orders ?? [];
  if (!fulfillments.length) throw new Error(`No fulfillments for order ${realId}`);
  const f0 = fulfillments[0];
  const fId = typeof f0 === "string" ? f0 : (f0 as Record<string, unknown>).id as string;
  if (!fId) throw new Error("Missing fulfillment id");
  return String(fId);
}

async function patchTracking(
  storeId: number, token: string, realId: number,
  fulfillmentId: string, trackingCode: string
): Promise<{ status: number; body: string }> {
  const url = `https://api.tiendanube.com/v1/${storeId}/orders/${realId}/fulfillment-orders/${fulfillmentId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: tnHeaders(token),
    body: JSON.stringify({
      status: "DISPATCHED",
      tracking_info: {
        code: trackingCode,
        url: `https://seguimiento.andreani.com/envio/${trackingCode}`,
        notify_customer: true,
      },
    }),
  });
  return { status: res.status, body: await res.text() };
}

// ── Route handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sfUserId = await getSessionUserId(req);
  const tokens = sfUserId ? readTokens(sfUserId) : null;
  if (!tokens) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Accept either JSON (preview only) or FormData (full process)
  const ct = req.headers.get("content-type") ?? "";

  // ── EXTRACT: PDF → tracking entries ─────────────────────────────
  if (ct.includes("multipart/form-data")) {
    const form    = await req.formData();
    const pdfFile = form.get("pdf") as File;
    if (!pdfFile) return NextResponse.json({ error: "Falta PDF" }, { status: 400 });

    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const pdfB64    = pdfBuffer.toString("base64");
    const scriptPath = path.join(process.cwd(), "scripts", "extract_tracking.py");

    let raw = "";
    let pyError = "";
    for (const cmd of ["python3", "python"]) {
      const result = spawnSync(cmd, [scriptPath], {
        input: JSON.stringify({ pdf_b64: pdfB64 }),
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
      });
      if (result.error) continue;
      if (result.status !== 0) {
        pyError = (result.stderr ?? "").trim() || `código ${result.status}`;
        break;
      }
      raw = (result.stdout ?? "").trim();
      pyError = "";
      break;
    }

    if (pyError) {
      return NextResponse.json({ error: `Error en el script Python: ${pyError}` }, { status: 500 });
    }
    if (!raw) {
      return NextResponse.json({ error: "Python no está instalado en el servidor" }, { status: 500 });
    }

    const entries: TrackingEntry[] = JSON.parse(raw);
    return NextResponse.json({ entries });
  }

  // ── SEND: entries → Tienda Nube ──────────────────────────────────
  const { entries }: { entries: TrackingEntry[] } = await req.json();
  const results: TrackingResult[] = [];

  for (const entry of entries) {
    try {
      const realId       = await lookupRealId(tokens.user_id, tokens.access_token, entry.order);
      const fulfillmentId = await getFulfillmentId(tokens.user_id, tokens.access_token, realId);
      const { status, body } = await patchTracking(tokens.user_id, tokens.access_token, realId, fulfillmentId, entry.tracking);

      if (status === 200 || status === 201) {
        results.push({ ...entry, status: "success" });
      } else {
        results.push({ ...entry, status: "error", detail: `HTTP ${status}: ${body}` });
      }
    } catch (err: unknown) {
      results.push({ ...entry, status: "error", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ results });
}
