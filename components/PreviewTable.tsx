import { AndreaniDomicilio, AndreaniSucursal, ValidationError } from "@/types/orders";

type RowType = AndreaniDomicilio | AndreaniSucursal;

interface PreviewTableProps {
  data: RowType[];
  errores: ValidationError[];
  tipo: "domicilio" | "sucursal";
}

export default function PreviewTable({ data, errores, tipo }: PreviewTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No hay pedidos de este tipo en el archivo.
      </div>
    );
  }

  // Set de órdenes con error para marcarlas
  const errorSet = new Set(errores.filter((e) => e.tipo === tipo).map((e) => e.numeroOrden));

  const columns = Object.keys(data[0]) as string[];

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide">
            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap sticky left-0 bg-gray-100 z-10">
              Estado
            </th>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const numeroInterno = (row as AndreaniDomicilio)["Numero Interno"];
            const hasError = errorSet.has(numeroInterno);
            return (
              <tr
                key={i}
                className={`border-t border-gray-100 ${
                  hasError ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"
                }`}
              >
                <td className={`px-3 py-2 sticky left-0 z-10 ${hasError ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  {hasError ? (
                    <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      OK
                    </span>
                  )}
                </td>
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 whitespace-nowrap text-gray-700 max-w-[200px] truncate">
                    {String((row as unknown as Record<string, unknown>)[col] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
