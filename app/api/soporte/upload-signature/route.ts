import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getUploadSignature } from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "soporte", "/soporte");
  if (!guard.ok) return guard.response;

  const signature = getUploadSignature("shipflow-soporte");
  return NextResponse.json(signature);
}
