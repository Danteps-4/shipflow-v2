interface SummaryCardsProps {
  totalFilas: number;
  ordenesUnicas: number;
  totalDomicilio: number;
  totalSucursal: number;
  totalErrores: number;
}

interface CardProps {
  label: string;
  value: number;
  color: string;
}

function Card({ label, value, color }: CardProps) {
  return (
    <div className={`rounded-xl p-4 border ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-600 mt-1">{label}</p>
    </div>
  );
}

export default function SummaryCards({
  totalFilas,
  ordenesUnicas,
  totalDomicilio,
  totalSucursal,
  totalErrores,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Card label="Filas leídas" value={totalFilas} color="border-gray-200 bg-gray-50" />
      <Card label="Órdenes únicas" value={ordenesUnicas} color="border-blue-200 bg-blue-50" />
      <Card label="A domicilio" value={totalDomicilio} color="border-green-200 bg-green-50" />
      <Card label="A sucursal" value={totalSucursal} color="border-purple-200 bg-purple-50" />
      <Card
        label="Con errores"
        value={totalErrores}
        color={totalErrores > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}
      />
    </div>
  );
}
