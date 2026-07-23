import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadSignature {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
}

// Firma server-side para que el navegador suba el archivo directo a
// Cloudinary (no pasa por nuestra API route) sin exponer el API secret.
export function getUploadSignature(folder = "shipflow-creativo"): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET ?? "",
  );
  return {
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  };
}

export async function destroyAsset(publicId: string, resourceType: "image" | "video"): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
