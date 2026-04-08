import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import { spawnSync } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

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

    const pdfBuffer  = Buffer.from(await pdfFile.arrayBuffer());
    const scriptPath = path.join(process.cwd(), "scripts", "extract_tracking.py");

    // Write PDF to a temp file to avoid large stdin pipe issues
    const tmpPath = path.join(os.tmpdir(), `tracking_${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, pdfBuffer);

    let raw = "";
    let pyError = "";
    try {
      for (const cmd of ["python3", "python"]) {
        const result = spawnSync(cmd, [scriptPath, tmpPath], {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          timeout: 25_000,
        });
        if (result.error) {
          if ((result.error as NodeJS.ErrnoException).code === "ENOENT") continue;
          pyError = result.error.message;
          break;
        }
        if (result.signal) {
          pyError = "El procesamiento del PDF tardó demasiado. Probá con menos páginas.";
          break;
        }
        if (result.status !== 0) {
          pyError = (result.stderr ?? "").trim() || `código ${result.status}`;
          break;
        }
        raw = (result.stdout ?? "").trim();
        pyError = "";
        break;
      }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }

    if (pyError) {
      return NextResponse.json({ error: pyError }, { status: 500 });
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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const DELAY_MS = 600; // TN rate limit: ~2 req/s, usamos 600 ms entre pedidos

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i > 0) await sleep(DELAY_MS);
    try {
      const realId        = await lookupRealId(tokens.user_id, tokens.access_token, entry.order);
      await sleep(DELAY_MS);
      const fulfillmentId = await getFulfillmentId(tokens.user_id, tokens.access_token, realId);
      await sleep(DELAY_MS);
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
