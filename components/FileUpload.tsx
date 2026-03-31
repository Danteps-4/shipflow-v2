"use client";

import { useRef, useState } from "react";

interface FileUploadProps {
  onFile: (content: string, fileName: string) => void;
  isLoading: boolean;
}

export default function FileUpload({ onFile, isLoading }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      alert("Por favor subí un archivo .csv");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFile(content, file.name);
    };
    // Leer como UTF-8; si el CSV usa latin-1, el usuario puede re-guardar como UTF-8
    reader.readAsText(file, "UTF-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
        ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50"}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
      />

      <div className="flex flex-col items-center gap-3">
        {/* Ícono */}
        <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
        </svg>

        {isLoading ? (
          <span className="text-gray-500">Procesando...</span>
        ) : fileName ? (
          <div>
            <p className="text-sm font-medium text-blue-600">{fileName}</p>
            <p className="text-xs text-gray-400 mt-1">Hacé click o arrastrá otro archivo para reemplazar</p>
          </div>
        ) : (
          <div>
            <p className="text-base font-medium text-gray-600">
              Arrastrá tu CSV acá o <span className="text-blue-500 underline">buscá el archivo</span>
            </p>
            <p className="text-sm text-gray-400 mt-1">Solo archivos .csv exportados desde Tienda Nube</p>
          </div>
        )}
      </div>
    </div>
  );
}
