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

export async function destroyAsset(publicId: string, resourceType: "image" | "video" | "raw"): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

// A diferencia de getUploadSignature (el navegador sube directo a
// Cloudinary), esto sube desde el propio servidor — para archivos que ya
// generamos ahí mismo (ej. el PDF de etiquetas con SKU) y no tiene sentido
// bajarlos al cliente para volver a subirlos.
// `format` es importante para recursos "raw": sin él, Cloudinary le pone un
// public_id random SIN extensión, y el navegador no tiene forma de saber
// que es un PDF (lo descarga como blob sin nombre ni formato).
export function uploadBuffer(buffer: Buffer, folder: string, format: string): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "raw", format },
      (err, result) => {
        if (err || !result) { reject(err ?? new Error("Cloudinary upload failed")); return; }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}
