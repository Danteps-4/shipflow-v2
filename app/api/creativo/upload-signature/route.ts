import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/permissions";
import { getUploadSignature } from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireModule(req, "creativo");
  if (!guard.ok) return guard.response;

  return NextResponse.json(getUploadSignature());
}
