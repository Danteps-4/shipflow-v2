"use client";

import { useState, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";

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

export default function EtiquetasPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [csv, setCsv]     = useState<FileState>(null);
  const [pdf, setPdf]     = useState<FileState>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState(false);

  async function handleProcess() {
    if (!csv || !pdf) return;
    setLoading(true);
    setError(null);
    setDone(false);

    try {
      const form = new FormData();
      form.append("csv", csv.file);
      form.append("pdf", pdf.file);

      const res = await fetch("/api/etiquetas", { method: "POST", body: form });

      if (!res.ok) {
        let errorMsg = "Error del servidor";
        try {
          const body = await res.json();
          errorMsg = body.error ?? errorMsg;
        } catch {
          // response is not JSON (e.g. empty body or HTML error page)
          errorMsg = `Error del servidor (HTTP ${res.status})`;
        }
        throw new Error(errorMsg);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "etiquetas_con_sku.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const ready = csv && pdf;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <div className={`sf-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sf-sidebar-header">
          <h3>Menú</h3>
          <button className="sf-close-btn" onClick={() => setSidebarOpen(false)}>
            <i className="fas fa-times" />
          </button>
        </div>
        <nav className="sf-nav">
          <a href="/"><i className="fas fa-house" /> Inicio</a>
          <a href="/orders"><i className="fas fa-receipt" /> Pedidos</a>
          <a href="/procesar"><i className="fas fa-file-excel" /> Procesar Pedidos</a>
          <a href="/etiquetas" className="active"><i className="fas fa-tags" /> Agregar SKU a Etiquetas</a>
          <a href="/tracking"><i className="fas fa-truck" /> Subir Tracking</a>
          <a href="/stock"><i className="fas fa-boxes-stacking" /> Stock de Productos</a>
        </nav>
      </div>

      <div className={`sf-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

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
            Agregar SKU a Etiquetas
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Agregá el SKU de cada pedido al pie del PDF de etiquetas de Andreani.
          </p>

          {/* ── PASO 1 ─────────────────────────────────────────── */}
          <div className="sf-section-title">
            <div className="sf-step-badge pending">1</div>
            <div>
              <h2>Subir archivos</h2>
              <p>ventas.csv de Tienda Nube y el PDF de paquetes de Andreani</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <DropZone
              label="ventas.csv"
              accept=".csv,text/csv"
              icon="fas fa-file-csv"
              value={csv}
              onChange={setCsv}
            />
            <DropZone
              label="PDF de paquetes (Andreani)"
              accept=".pdf,application/pdf"
              icon="fas fa-file-pdf"
              value={pdf}
              onChange={setPdf}
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
              <h2>Generar etiquetas con SKU</h2>
              <p>Se descargará el PDF con el SKU al pie de cada etiqueta</p>
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
              <><i className="fas fa-tags" /> Generar PDF con SKU</>
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
