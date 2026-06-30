"use client";

import { useState, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

type FileState = { file: File; name: string } | null;

function DropZone({
  label,
  accept,
  icon,
  value,
  onChange,
}: {
  label: string;
  accept: string;
  icon: string;
  value: FileState;
  onChange: (f: FileState) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onChange({ file, name: file.name });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onChange({ file, name: file.name });
  }

  return (
    <div
      className={`sf-dropzone ${value ? "sf-dropzone--done" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={handleChange} />
      {value ? (
        <>
          <i className="fas fa-circle-check" style={{ fontSize: "1.5rem", color: "var(--success-color)" }} />
          <span style={{ fontWeight: 600 }}>{value.name}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click para cambiar</span>
        </>
      ) : (
        <>
          <i className={`${icon}`} style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} />
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Arrastrá o hacé click</span>
        </>
      )}
    </div>
  );
}

export default function EtiquetasMlPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [file, setFile] = useState<FileState>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleProcess() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setDone(false);

    try {
      const form = new FormData();
      form.append("file", file.file);

      const res = await fetch("/api/etiquetas-ml", { method: "POST", body: form });

      if (!res.ok) {
        let errorMsg = "Error del servidor";
        try {
          const body = await res.json();
          errorMsg = body.error ?? errorMsg;
        } catch {
          errorMsg = `Error del servidor (HTTP ${res.status})`;
        }
        throw new Error(errorMsg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const hoy = new Date();
      const dd = String(hoy.getDate()).padStart(2, "0");
      const mm = String(hoy.getMonth() + 1).padStart(2, "0");
      const aa = String(hoy.getFullYear()).slice(2);
      a.download = `etiquetas_ml_${dd}-${mm}-${aa}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const ready = !!file;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand">
          <i className="fas fa-rocket" />
          ShipFlow
        </a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────── */}
      <main className="sf-main">
        <div className="sf-container">

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Etiquetas ML (ZPL → PDF)
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Convertí el ZIP o TXT de etiquetas ZPL de Mercado Libre a un PDF listo para tu impresora térmica.
          </p>

          {/* ── PASO 1 ─────────────────────────────────────────── */}
          <div className="sf-section-title">
            <div className="sf-step-badge pending">1</div>
            <div>
              <h2>Subir archivo</h2>
              <p>ZIP o TXT con las etiquetas ZPL exportadas de Mercado Libre</p>
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <DropZone
              label="Etiquetas ML (.zip o .txt)"
              accept=".zip,.txt,application/zip,text/plain"
              icon="fas fa-file-zipper"
              value={file}
              onChange={setFile}
            />
          </div>

          {/* ── PASO 2 ─────────────────────────────────────────── */}
          <div className="sf-section-title">
            <div className={`sf-step-badge ${done ? "" : "pending"}`}>
              {done
                ? <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                : "2"
              }
            </div>
            <div>
              <h2>Generar PDF</h2>
              <p>Se descargará un PDF de 4×6&quot; con una etiqueta por página y el SKU incluido</p>
            </div>
          </div>

          {error && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-triangle-exclamation" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="sf-alert sf-alert-ok" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
              <span>PDF generado y descargado correctamente.</span>
            </div>
          )}

          <button
            className="sf-btn"
            onClick={handleProcess}
            disabled={!ready || loading}
            style={{ opacity: ready && !loading ? 1 : 0.5, cursor: ready && !loading ? "pointer" : "not-allowed" }}
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin" /> Procesando...</>
            ) : (
              <><i className="fas fa-barcode" /> Convertir a PDF</>
            )}
          </button>

        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>
    </div>
  );
}
