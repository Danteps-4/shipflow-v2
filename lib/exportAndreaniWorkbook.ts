import { AndreaniDomicilio, AndreaniSucursal } from "@/types/orders";

/**
 * Llama a la API route /api/export, que corre Python + openpyxl en el servidor
 * (idéntico al método de web_app original) y descarga el archivo resultante.
 */
export async function exportAndreaniWorkbook(
  domicilio: AndreaniDomicilio[],
  sucursal: AndreaniSucursal[]
): Promise<void> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domicilio, sucursal }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Export fallido: ${text}`);
  }

  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "andreani_pedidos.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
