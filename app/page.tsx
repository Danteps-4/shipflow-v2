"use client";

import { useState } from "react";
import FileUpload from "@/components/FileUpload";
import SummaryCards from "@/components/SummaryCards";
import PreviewTable from "@/components/PreviewTable";
import ErrorTable from "@/components/ErrorTable";
import { parseCsv } from "@/lib/parseCsv";
import { groupOrders } from "@/lib/groupOrders";
import { transformOrders } from "@/lib/transformOrders";
import { exportAndreaniWorkbook } from "@/lib/exportAndreaniWorkbook";
import { ProcessingResult } from "@/types/orders";

type Tab = "domicilio" | "sucursal" | "errores";

export default function Home() {
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("domicilio");
  const [parseWarning, setParseWarning] = useState<string | null>(null);

  function handleFile(content: string) {
    setIsLoading(true);
    setParseWarning(null);

    try {
      // 1. Parsear el CSV
      const { rows, columnMap } = parseCsv(content);

      // Advertir si alguna columna clave no fue encontrada
      const missingCols: string[] = [];
      if (!columnMap.numeroOrden) missingCols.push("Número de orden");
      if (!columnMap.nombreEnvio) missingCols.push("Nombre para el envío");
      if (!columnMap.medioEnvio) missingCols.push("Medio de envío");
      if (missingCols.length > 0) {
        setParseWarning(`Columnas no detectadas: ${missingCols.join(", ")}. Verificá que el CSV sea de Tienda Nube.`);
      }

      // 2. Agrupar por número de orden
      const grouped = groupOrders(rows, columnMap);

      // 3. Transformar al formato Andreani
      const { domicilio, sucursal, errores } = transformOrders(grouped);

      setResult({
        totalFilas: rows.length,
        ordenesUnicas: grouped.length,
        domicilio,
        sucursal,
        errores,
      });

      // Ir al tab con contenido
      if (errores.length > 0) setActiveTab("errores");
      else if (domicilio.length > 0) setActiveTab("domicilio");
      else setActiveTab("sucursal");

    } catch (err) {
      console.error(err);
      setParseWarning("Error al procesar el archivo. Verificá que sea un CSV válido de Tienda Nube.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleExport() {
    if (!result) return;
    exportAndreaniWorkbook(result.domicilio, result.sucursal);
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "domicilio", label: "A domicilio", count: result?.domicilio.length },
    { key: "sucursal", label: "A sucursal", count: result?.sucursal.length },
    { key: "errores", label: "Errores", count: result?.errores.length },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Conversor Tienda Nube → Andreani
          </h1>
          <p className="text-gray-500 text-sm">
            Subí el CSV exportado desde Tienda Nube y descargá el archivo listo para cargar en Andreani.
          </p>
        </div>

        {/* Upload */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">1. Subir archivo CSV</h2>
          <FileUpload onFile={handleFile} isLoading={isLoading} />

          {parseWarning && (
            <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {parseWarning}
            </div>
          )}
        </div>

        {/* Resumen + Preview + Export (solo cuando hay resultado) */}
        {result && (
          <>
            {/* Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-700">2. Resumen del procesamiento</h2>
              <SummaryCards
                totalFilas={result.totalFilas}
                ordenesUnicas={result.ordenesUnicas}
                totalDomicilio={result.domicilio.length}
                totalSucursal={result.sucursal.length}
                totalErrores={result.errores.length}
              />
            </div>

            {/* Preview con tabs */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-semibold text-gray-700">3. Vista previa</h2>

                {/* Tabs */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        activeTab === tab.key
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab.label}
                      {tab.count !== undefined && (
                        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                          tab.key === "errores" && (tab.count ?? 0) > 0
                            ? activeTab === tab.key ? "bg-red-100 text-red-600" : "bg-red-200 text-red-600"
                            : "bg-gray-200 text-gray-600"
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === "domicilio" && (
                <PreviewTable data={result.domicilio} errores={result.errores} tipo="domicilio" />
              )}
              {activeTab === "sucursal" && (
                <PreviewTable data={result.sucursal} errores={result.errores} tipo="sucursal" />
              )}
              {activeTab === "errores" && (
                <ErrorTable errores={result.errores} />
              )}
            </div>

            {/* Export */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="font-semibold text-gray-700">4. Descargar archivo</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    Genera un .xlsx con las hojas "A domicilio" y "A sucursal"
                    {result.errores.length > 0 && (
                      <span className="text-amber-600"> · {result.errores.length} pedido(s) con errores incluidos</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar Excel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
