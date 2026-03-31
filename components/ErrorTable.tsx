import { ValidationError } from "@/types/orders";

interface ErrorTableProps {
  errores: ValidationError[];
}

export default function ErrorTable({ errores }: ErrorTableProps) {
  if (errores.length === 0) {
    return (
      <div className="text-center py-12 text-green-600 font-medium">
        Sin errores de validación. Todos los pedidos están completos.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-red-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-red-50 text-red-700 uppercase tracking-wide text-xs">
            <th className="px-4 py-3 text-left font-semibold">N° Orden</th>
            <th className="px-4 py-3 text-left font-semibold">Tipo</th>
            <th className="px-4 py-3 text-left font-semibold">Campos con problemas</th>
          </tr>
        </thead>
        <tbody>
          {errores.map((err, i) => (
            <tr key={i} className="border-t border-red-100">
              <td className="px-4 py-3 font-mono font-medium text-red-700">
                {err.numeroOrden}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  err.tipo === "domicilio"
                    ? "bg-green-100 text-green-700"
                    : "bg-purple-100 text-purple-700"
                }`}>
                  {err.tipo === "domicilio" ? "A domicilio" : "A sucursal"}
                </span>
              </td>
              <td className="px-4 py-3">
                <ul className="list-disc list-inside space-y-0.5">
                  {err.campos.map((campo, j) => (
                    <li key={j} className="text-gray-700">{campo}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
