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
      if (content.includes("\uFFFD")) {
        const reader2 = new FileReader();
        reader2.onload = (e2) => {
          onFile(e2.target?.result as string, file.name);
        };
        reader2.readAsText(file, "windows-1252");
      } else {
        onFile(content, file.name);
      }
    };
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

  const zoneClass = [
    "sf-drop-zone",
    dragOver ? "dragover" : "",
    fileName  ? "has-file" : "",
    isLoading ? "opacity-70 cursor-default" : "",
  ].join(" ");

  return (
    <div
      className={zoneClass}
      onClick={() => !isLoading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleChange} />

      {isLoading ? (
        <>
          <i className="fas fa-spinner fa-spin sf-drop-icon" style={{ color: "var(--primary-color)" }} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Procesando archivo...</p>
        </>
      ) : fileName ? (
        <>
          <i className="fas fa-circle-check sf-drop-icon" style={{ color: "var(--success-color)" }} />
          <p style={{ fontWeight: 600, color: "var(--primary-color)", marginBottom: "0.25rem" }}>{fileName}</p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Hacé click o arrastrá otro archivo para reemplazar
          </p>
        </>
      ) : (
        <>
          <i className="fas fa-cloud-arrow-up sf-drop-icon" />
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
            Arrastrá tu CSV acá o{" "}
            <span style={{ color: "var(--primary-color)", textDecoration: "underline" }}>buscá el archivo</span>
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Exportación de Tienda Nube · formato .csv
          </p>
        </>
      )}
    </div>
  );
}
