"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

type Tipo = "angulo" | "guion" | "formato";

const TIPO_LABEL: Record<Tipo, { label: string; singular: string; icon: string }> = {
  angulo:  { label: "Ángulos",  singular: "ángulo",  icon: "fas fa-arrows-turn-to-dots" },
  guion:   { label: "Guiones",  singular: "guion",   icon: "fas fa-file-lines" },
  formato: { label: "Formatos", singular: "formato", icon: "fas fa-clapperboard" },
};

interface CreativoArchivo {
  id: number;
  url: string;
  public_id: string;
  tipo_archivo: "image" | "video";
}

interface Creativo {
  id: number;
  tipo: Tipo;
  titulo: string;
  contenido: string;
  tags: string[];
  created_by: string;
  created_at: string;
  archivos: CreativoArchivo[];
}

interface ArchivoEnCarga {
  nombre: string;
  status: "subiendo" | "listo" | "error";
  url?: string;
  publicId?: string;
  tipoArchivo?: "image" | "video";
}

export default function CreativoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tipo, setTipo]               = useState<Tipo>("angulo");
  const [tagFiltro, setTagFiltro]     = useState<string | null>(null);

  const [items, setItems]     = useState<Creativo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [titulo, setTitulo]       = useState("");
  const [contenido, setContenido] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [archivos, setArchivos]   = useState<ArchivoEnCarga[]>([]);
  const [saving, setSaving]       = useState(false);
  const fileInputRef              = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const params = new URLSearchParams({ tipo });
      if (tagFiltro) params.set("tag", tagFiltro);
      const res = await fetch(`/api/creativo?${params}`);
      if (res.status === 401 || res.status === 403) { setError("No tenés acceso a este módulo."); return; }
      if (!res.ok) throw new Error("Error al cargar");
      const { creativos } = await res.json();
      setItems(creativos ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [tipo, tagFiltro]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const tagsDisponibles = Array.from(new Set(items.flatMap(i => i.tags))).sort();

  function abrirModal() {
    setTitulo("");
    setContenido("");
    setTagsInput("");
    setArchivos([]);
    setModalOpen(true);
  }

  async function subirArchivos(files: FileList) {
    const nuevos: ArchivoEnCarga[] = Array.from(files).map(f => ({ nombre: f.name, status: "subiendo" as const }));
    setArchivos(prev => [...prev, ...nuevos]);

    for (const file of Array.from(files)) {
      try {
        const firmaRes = await fetch("/api/creativo/upload-signature", { method: "POST" });
        if (!firmaRes.ok) throw new Error("No se pudo firmar la subida");
        const { timestamp, signature, apiKey, cloudName } = await firmaRes.json();

        const form = new FormData();
        form.append("file", file);
        form.append("api_key", apiKey);
        form.append("timestamp", String(timestamp));
        form.append("signature", signature);
        form.append("folder", "shipflow-creativo");

        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
          method: "POST",
          body: form,
        });
        if (!uploadRes.ok) throw new Error("Error al subir a Cloudinary");
        const data = await uploadRes.json();
        const tipoArchivo: "image" | "video" = data.resource_type === "video" ? "video" : "image";

        setArchivos(prev => prev.map(a =>
          a.nombre === file.name && a.status === "subiendo"
            ? { ...a, status: "listo", url: data.secure_url, publicId: data.public_id, tipoArchivo }
            : a
        ));
      } catch {
        setArchivos(prev => prev.map(a =>
          a.nombre === file.name && a.status === "subiendo" ? { ...a, status: "error" } : a
        ));
      }
    }
  }

  function quitarArchivo(nombre: string) {
    setArchivos(prev => prev.filter(a => a.nombre !== nombre));
  }

  async function handleGuardar() {
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
      const archivosListos = archivos
        .filter(a => a.status === "listo")
        .map(a => ({ url: a.url!, publicId: a.publicId!, tipoArchivo: a.tipoArchivo! }));

      const res = await fetch("/api/creativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, titulo, contenido, tags, archivos: archivosListos }),
      });
      if (res.ok) {
        setModalOpen(false);
        await fetchItems();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrar(id: number) {
    if (!confirm("¿Borrar esta entrada? También se van a borrar sus archivos adjuntos.")) return;
    await fetch("/api/creativo", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StoreSwitcher /><UserMenu />
        </div>
      </header>

      <main className="sf-main">
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Creativo</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Ángulos, guiones y formatos que ya funcionaron, para no perderlos y poder reusarlos.
          </p>

          <div className="sf-tabs" style={{ marginBottom: "1rem" }}>
            {(Object.entries(TIPO_LABEL) as [Tipo, { label: string; singular: string; icon: string }][]).map(([key, cfg]) => (
              <button
                key={key}
                className={`sf-tab ${tipo === key ? "active" : ""}`}
                onClick={() => { setTipo(key); setTagFiltro(null); }}
              >
                <i className={cfg.icon} /> {cfg.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {tagsDisponibles.map(tag => (
                <button
                  key={tag}
                  onClick={() => setTagFiltro(prev => prev === tag ? null : tag)}
                  className="sf-badge"
                  style={{
                    cursor: "pointer", border: "1px solid var(--border-color)",
                    background: tagFiltro === tag ? "var(--primary-color)" : "transparent",
                    color: tagFiltro === tag ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            <button className="sf-btn" onClick={abrirModal}>
              <i className="fas fa-plus" /> Nuevo {TIPO_LABEL[tipo].singular}
            </button>
          </div>

          {error && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.5rem" }} />Cargando...
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="sf-empty">
              <i className={`${TIPO_LABEL[tipo].icon} sf-empty-icon`} />
              <p style={{ fontWeight: 600, color: "var(--text-color)", marginBottom: "0.25rem" }}>
                Todavía no cargaste ningún {TIPO_LABEL[tipo].singular}
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Hacé click en &quot;Nuevo&quot; para empezar.
              </p>
            </div>
          )}

          {!loading && items.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
              {items.map(item => (
                <div key={item.id} style={{
                  border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
                  padding: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>{item.titulo}</h3>
                    <button
                      onClick={() => handleBorrar(item.id)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}
                      title="Borrar"
                    >
                      <i className="fas fa-trash" />
                    </button>
                  </div>

                  {item.contenido && (
                    <p style={{ fontSize: "0.83rem", color: "var(--text-color)", whiteSpace: "pre-wrap" }}>{item.contenido}</p>
                  )}

                  {item.archivos.length > 0 && (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {item.archivos.map(a => (
                        a.tipo_archivo === "image" ? (
                          <img key={a.id} src={a.url} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: "var(--radius)" }} />
                        ) : (
                          <video key={a.id} src={a.url} controls style={{ width: 160, height: 90, borderRadius: "var(--radius)" }} />
                        )
                      ))}
                    </div>
                  )}

                  {item.tags.length > 0 && (
                    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                      {item.tags.map(tag => (
                        <span key={tag} className="sf-badge" style={{ fontSize: "0.65rem" }}>{tag}</span>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "auto" }}>
                    {item.created_by && <>Cargado por <strong>{item.created_by}</strong> · </>}
                    {fmtDate(item.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>

      {modalOpen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setModalOpen(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(560px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-plus" style={{ color: "var(--primary-color)" }} />
                Nuevo {TIPO_LABEL[tipo].singular}
              </h3>
              <button className="sf-close-btn" onClick={() => setModalOpen(false)}><i className="fas fa-times" /></button>
            </div>

            <div className="sf-modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Título *
                  </label>
                  <input type="text" className="sf-input" value={titulo} onChange={e => setTitulo(e.target.value)}
                    placeholder="Ej: Ángulo dolor -> solución rápida" style={{ width: "100%" }} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Contenido
                  </label>
                  <textarea
                    className="sf-input" value={contenido} onChange={e => setContenido(e.target.value)}
                    rows={5} style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                    placeholder="El guion, la descripción del ángulo o del formato..."
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Tags (separados por coma)
                  </label>
                  <input type="text" className="sf-input" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
                    placeholder="verano, producto-x, urgencia" style={{ width: "100%" }} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Imágenes / videos
                  </label>
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) subirArchivos(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                    className="sf-dropzone"
                  >
                    <input
                      ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }}
                      onChange={e => { if (e.target.files?.length) subirArchivos(e.target.files); e.target.value = ""; }}
                    />
                    <i className="fas fa-cloud-arrow-up" style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} />
                    <span style={{ fontWeight: 600 }}>Arrastrá o hacé click</span>
                  </div>

                  {archivos.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.6rem" }}>
                      {archivos.map(a => (
                        <div key={a.nombre} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
                          {a.status === "subiendo" && <i className="fas fa-spinner fa-spin" style={{ color: "var(--text-muted)" }} />}
                          {a.status === "listo" && <i className="fas fa-circle-check" style={{ color: "var(--success-color)" }} />}
                          {a.status === "error" && <i className="fas fa-circle-exclamation" style={{ color: "var(--error-color)" }} />}
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nombre}</span>
                          <button onClick={() => quitarArchivo(a.nombre)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                            <i className="fas fa-times" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button
                className="sf-btn" onClick={handleGuardar}
                disabled={saving || !titulo.trim() || archivos.some(a => a.status === "subiendo")}
              >
                {saving ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-floppy-disk" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
