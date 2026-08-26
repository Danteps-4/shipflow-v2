import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { readTokens } from "@/lib/tnTokens";
import { getSessionUserId } from "@/lib/getSessionUser";
import {
  initDepositoTables, getEtiquetasDeposito, createEtiquetaDeposito,
  marcarEtiquetaImpresa, deleteEtiquetaDeposito, EstadoEtiquetaDeposito, OrigenEtiquetaDeposito,
} from "@/lib/depositoDb";

const ORIGENES_VALIDOS: OrigenEtiquetaDeposito[] = ["tienda_nube", "mercado_libre"];
import { uploadBuffer, destroyAsset } from "@/lib/cloudinary";

export const runtime = "nodejs";

async function getStoreId(req: NextRequest): Promise<string | null> {
  const sfUserId = await getSessionUserId(req);
  if (!sfUserId) return null;
  const tokens = readTokens(sfUserId);
  if (!tokens) return null;
  return String(tokens.user_id);
}

// Sin scope por tienda a propósito: depósito ve las etiquetas de todas las
// tiendas de Tienda Nube conectadas juntas, no separadas por la tienda
// activa (ver comentario en lib/depositoDb.ts).
export async function GET(req: NextRequest) {
  const guard = await requireModule(req, "deposito", "/deposito");
  if (!guard.ok) return guard.response;

  const estadoParam = req.nextUrl.searchParams.get("estado");
  const estado: EstadoEtiquetaDeposito = estadoParam === "impresa" ? "impresa" : "pendiente";

  await initDepositoTables();
  const etiquetas = await getEtiquetasDeposito(estado);
  return NextResponse.json({ etiquetas });
}

// Subida manual: alguien ya tiene un PDF de etiquetas generado por afuera
// (o quiere sumar algo puntual) y lo sube directo para que depósito lo vea.
export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "deposito", "/deposito");
  if (!guard.ok) return guard.response;

  const storeId = await getStoreId(req);
  if (!storeId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Error al leer el archivo enviado" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tituloForm = (formData.get("titulo") as string | null)?.trim();
  const origenForm = formData.get("origen") as string | null;
  if (!file) return NextResponse.json({ error: "Falta el archivo PDF" }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "El archivo tiene que ser un PDF" }, { status: 400 });
  }
  if (!origenForm || !ORIGENES_VALIDOS.includes(origenForm as OrigenEtiquetaDeposito)) {
    return NextResponse.json({ error: "Falta indicar para qué es (Tienda Nube o Mercado Libre)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, publicId } = await uploadBuffer(buffer, "shipflow-deposito", "pdf");

  await initDepositoTables();
  const etiqueta = await createEtiquetaDeposito(storeId, {
    origen: origenForm as OrigenEtiquetaDeposito,
    titulo: tituloForm || file.name,
    url,
    publicId,
    createdBy: guard.user.name,
  });
  return NextResponse.json({ etiqueta });
}

// Body: { id } marca una etiqueta como impresa (sale del listado principal).
export async function PATCH(req: NextRequest) {
  const guard = await requireModule(req, "deposito", "/deposito");
  if (!guard.ok) return guard.response;

  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initDepositoTables();
  const etiqueta = await marcarEtiquetaImpresa(Number(id), guard.user.name);
  if (!etiqueta) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ etiqueta });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireModule(req, "deposito", "/deposito");
  if (!guard.ok) return guard.response;

  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  await initDepositoTables();
  const borrada = await deleteEtiquetaDeposito(Number(id));
  if (!borrada) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  await destroyAsset(borrada.public_id, "raw").catch(() => {});
  return NextResponse.json({ ok: true });
}
