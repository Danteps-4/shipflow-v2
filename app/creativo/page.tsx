"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
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

type MainTab = Tipo | "publicidad";

export default function CreativoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mainTab, setMainTab]         = useState<MainTab>("angulo");
  const [tagFiltro, setTagFiltro]     = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "publicidad") setMainTab("publicidad");
  }, []);

  const tipo = mainTab === "publicidad" ? null : mainTab;

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
    if (!tipo) return;
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
    if (!titulo.trim() || !tipo) return;
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

      <main className="sf-main" style={mainTab === "publicidad" ? { maxWidth: 1700 } : undefined}>
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Creativo</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Ángulos, guiones y formatos que ya funcionaron, para no perderlos y poder reusarlos.
          </p>

          <div className="sf-tabs" style={{ marginBottom: "1rem" }}>
            {(Object.entries(TIPO_LABEL) as [Tipo, { label: string; singular: string; icon: string }][]).map(([key, cfg]) => (
              <button
                key={key}
                className={`sf-tab ${mainTab === key ? "active" : ""}`}
                onClick={() => { setMainTab(key); setTagFiltro(null); }}
              >
                <i className={cfg.icon} /> {cfg.label}
              </button>
            ))}
            <button
              className={`sf-tab ${mainTab === "publicidad" ? "active" : ""}`}
              onClick={() => setMainTab("publicidad")}
            >
              <i className="fas fa-bullhorn" /> Publicidad
            </button>
          </div>

          {tipo && (
            <>
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
            </>
          )}

          {mainTab === "publicidad" && <MetaAdsPanel />}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>

      {modalOpen && tipo && (
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

// ─── Publicidad (Meta Ads) ──────────────────────────────────────────────────

type BudgetField = "daily_budget" | "lifetime_budget";

interface MetaMetricas {
  gasto: number;
  impresiones: number;
  clics: number;
  ctr: number;
  agregadosCarrito: number;
  pagosIniciados: number;
  compras: number;
  valorCompras: number;
  roas: number;
}

interface MetaNode extends MetaMetricas {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}

type AdNode = MetaNode;
interface AdSetNode extends MetaNode { ads: AdNode[] }
interface CampaignNode extends MetaNode { adsets: AdSetNode[] }

const ENTREGA_LABEL: Record<string, { label: string; color: string }> = {
  ACTIVE:          { label: "Activo",           color: "var(--success-color)" },
  PAUSED:          { label: "Pausado",          color: "var(--text-muted)" },
  DELETED:         { label: "Eliminado",        color: "var(--error-color)" },
  ARCHIVED:        { label: "Archivado",        color: "var(--text-muted)" },
  PENDING_REVIEW:  { label: "En revisión",      color: "#f59e0b" },
  DISAPPROVED:     { label: "Rechazado",        color: "var(--error-color)" },
  ADSET_PAUSED:    { label: "Conjunto pausado", color: "var(--text-muted)" },
  CAMPAIGN_PAUSED: { label: "Campaña pausada",  color: "var(--text-muted)" },
  IN_PROCESS:      { label: "En proceso",       color: "#f59e0b" },
  WITH_ISSUES:     { label: "Con problemas",    color: "var(--error-color)" },
};

function fechaHoyMeta(): string {
  return new Date().toISOString().slice(0, 10);
}

function fechaHaceDias(dias: number): string {
  return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
}

function fmtMoneyMeta(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

interface EditBudgetState {
  nodeId: string;
  field: BudgetField;
  value: string;
}

interface NodeRowProps {
  node: MetaNode;
  nivel: number;
  expandible: boolean;
  expandido: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  toggling: boolean;
  editBudget: EditBudgetState | null;
  onStartEdit: () => void;
  onChangeEdit: (v: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  savingBudget: boolean;
}

function NodeRow({
  node, nivel, expandible, expandido, onToggleExpand, onToggleStatus, toggling,
  editBudget, onStartEdit, onChangeEdit, onCancelEdit, onSaveEdit, savingBudget,
}: NodeRowProps) {
  const entrega = ENTREGA_LABEL[node.effectiveStatus] ?? { label: node.effectiveStatus, color: "var(--text-muted)" };
  const isActive = node.status === "ACTIVE";
  const isEditingThis = editBudget?.nodeId === node.id;
  const budgetField: BudgetField | null = node.dailyBudget !== null ? "daily_budget" : node.lifetimeBudget !== null ? "lifetime_budget" : null;
  const budgetValue = budgetField === "daily_budget" ? node.dailyBudget : budgetField === "lifetime_budget" ? node.lifetimeBudget : null;

  return (
    <tr style={{ background: nivel === 1 ? "rgba(255,255,255,0.02)" : nivel === 2 ? "rgba(255,255,255,0.04)" : undefined }}>
      <td style={{ width: 24 }}>
        {expandible && (
          <button onClick={onToggleExpand} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}>
            <i className={`fas fa-chevron-${expandido ? "down" : "right"}`} style={{ fontSize: "0.7rem" }} />
          </button>
        )}
      </td>
      <td style={{ width: 50 }}>
        <button
          onClick={onToggleStatus}
          disabled={toggling}
          title={isActive ? "Pausar" : "Activar"}
          style={{
            width: 34, height: 18, borderRadius: 999, border: "none", cursor: "pointer",
            background: isActive ? "var(--success-color)" : "var(--border-color)",
            position: "relative", transition: "background 0.15s", opacity: toggling ? 0.5 : 1,
          }}
        >
          <span style={{
            position: "absolute", top: 2, left: isActive ? 18 : 2, width: 14, height: 14,
            borderRadius: "50%", background: "#fff", transition: "left 0.15s",
          }} />
        </button>
      </td>
      <td style={{ paddingLeft: `${1 + nivel * 1.5}rem`, whiteSpace: "normal" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: entrega.color, flexShrink: 0 }} title={entrega.label} />
          {node.name}
        </span>
      </td>
      <td>
        {isEditingThis ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <input
              type="number" className="sf-input" style={{ width: 90 }} value={editBudget!.value}
              onChange={e => onChangeEdit(e.target.value)} autoFocus
            />
            <button onClick={onSaveEdit} disabled={savingBudget} style={{ background: "none", border: "none", color: "var(--success-color)", cursor: "pointer" }}>
              <i className="fas fa-check" />
            </button>
            <button onClick={onCancelEdit} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
              <i className="fas fa-times" />
            </button>
          </div>
        ) : budgetField ? (
          <button onClick={onStartEdit} style={{ background: "none", border: "none", color: "var(--text-color)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.35rem", whiteSpace: "nowrap" }}>
            <i className="fas fa-pen" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }} />
            {fmtMoneyMeta(budgetValue ?? 0)} <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{budgetField === "daily_budget" ? "/día" : "/total"}</span>
          </button>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>–</span>
        )}
      </td>
      <td style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtMoneyMeta(node.gasto)}</td>
      <td style={{ textAlign: "right" }}>{node.impresiones.toLocaleString("es-AR")}</td>
      <td style={{ textAlign: "right" }}>{node.clics.toLocaleString("es-AR")}</td>
      <td style={{ textAlign: "right" }}>{node.ctr.toFixed(2)}%</td>
      <td style={{ textAlign: "right" }}>{node.agregadosCarrito}</td>
      <td style={{ textAlign: "right" }}>{node.pagosIniciados}</td>
      <td style={{ textAlign: "right" }}>{node.compras}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoneyMeta(node.valorCompras)}</td>
      <td style={{ textAlign: "right", fontWeight: 700, color: node.roas >= 1 ? "var(--success-color)" : "var(--error-color)" }}>
        {node.roas.toFixed(2)}x
      </td>
    </tr>
  );
}

function MetaAdsPanel() {
  const [connected, setConnected]       = useState<boolean | null>(null);
  const [nombreCuenta, setNombreCuenta] = useState("");
  const [desde, setDesde]               = useState(() => fechaHaceDias(7));
  const [hasta, setHasta]               = useState(() => fechaHoyMeta());
  const [campaigns, setCampaigns]       = useState<CampaignNode[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filtro, setFiltro]             = useState("");
  const [soloActivas, setSoloActivas]   = useState(true);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdsets, setExpandedAdsets]       = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds]   = useState<Set<string>>(new Set());
  const [editBudget, setEditBudget]     = useState<EditBudgetState | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);

  useEffect(() => { checkStatus(); }, []);

  async function checkStatus() {
    try {
      const res = await fetch("/api/creativo/meta/status");
      const data = await res.json();
      setConnected(!!data.connected);
      setNombreCuenta(data.nombreCuenta ?? "");
      if (data.connected) fetchTree(desde, hasta);
    } catch {
      setConnected(false);
    }
  }

  async function fetchTree(d: string, h: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creativo/meta/tree?desde=${d}&hasta=${h}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error al consultar Meta"); setCampaigns([]); return; }
      setCampaigns(data.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar la cuenta de Meta?")) return;
    await fetch("/api/creativo/meta/disconnect", { method: "POST" });
    setConnected(false);
    setCampaigns([]);
  }

  function aplicarPreset(dias: number) {
    const d = fechaHaceDias(dias);
    const h = fechaHoyMeta();
    setDesde(d);
    setHasta(h);
    fetchTree(d, h);
  }

  function toggleExpand(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  }

  async function handleToggleStatus(node: MetaNode) {
    const nuevoEstado = node.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const accion = nuevoEstado === "ACTIVE" ? "activar" : "pausar";
    if (!confirm(`¿Seguro que querés ${accion} "${node.name}"?`)) return;

    setTogglingIds(prev => new Set(prev).add(node.id));
    try {
      const res = await fetch("/api/creativo/meta/node-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, status: nuevoEstado }),
      });
      if (res.ok) {
        await fetchTree(desde, hasta);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Error al actualizar el estado");
      }
    } finally {
      setTogglingIds(prev => { const s = new Set(prev); s.delete(node.id); return s; });
    }
  }

  function startEditBudget(node: MetaNode) {
    const field: BudgetField = node.dailyBudget !== null ? "daily_budget" : "lifetime_budget";
    const actual = field === "daily_budget" ? node.dailyBudget : node.lifetimeBudget;
    setEditBudget({ nodeId: node.id, field, value: String(actual ?? "") });
  }

  async function saveBudget(node: MetaNode) {
    if (!editBudget) return;
    const nuevoMonto = Number(editBudget.value);
    if (!nuevoMonto || nuevoMonto <= 0) return;
    const actual = editBudget.field === "daily_budget" ? node.dailyBudget : node.lifetimeBudget;
    if (!confirm(`¿Cambiar el presupuesto de "${node.name}" de ${fmtMoneyMeta(actual ?? 0)} a ${fmtMoneyMeta(nuevoMonto)}?`)) return;

    setSavingBudget(true);
    try {
      const res = await fetch("/api/creativo/meta/node-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, field: editBudget.field, monto: nuevoMonto }),
      });
      if (res.ok) {
        setEditBudget(null);
        await fetchTree(desde, hasta);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Error al actualizar el presupuesto");
      }
    } finally {
      setSavingBudget(false);
    }
  }

  if (connected === null) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>
        <i className="fas fa-spinner fa-spin" style={{ marginRight: "0.5rem" }} />Verificando conexión...
      </div>
    );
  }

  if (!connected) {
    return (
      <div>
        <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
          <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
          <span>No hay ninguna cuenta de Meta conectada.</span>
        </div>
        <a href="/api/auth/meta/connect" className="sf-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <i className="fab fa-facebook" /> Conectar cuenta de Meta
        </a>
      </div>
    );
  }

  const campaignsFiltradas = campaigns
    .filter(c => !soloActivas || c.status === "ACTIVE")
    .filter(c => !filtro || c.name.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div className="sf-alert sf-alert-ok" style={{ flex: 1, marginBottom: 0, minWidth: 220 }}>
          <i className="fas fa-circle-check" style={{ flexShrink: 0 }} />
          <span>Conectado · <strong>{nombreCuenta}</strong></span>
        </div>
        <button onClick={handleDisconnect} style={{
          background: "none", border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
          padding: "0.5rem 0.85rem", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", whiteSpace: "nowrap",
        }}>
          <i className="fas fa-unlink" style={{ marginRight: "0.35rem" }} /> Desconectar
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Filtrar campañas</label>
          <input type="text" className="sf-input" style={{ width: "100%" }} value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar campañas..." />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "var(--text-color)", paddingBottom: "0.55rem", whiteSpace: "nowrap", cursor: "pointer" }}>
          <input type="checkbox" checked={soloActivas} onChange={e => setSoloActivas(e.target.checked)} />
          Solo activas
        </label>
        <div>
          <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Desde</label>
          <input type="date" className="sf-input" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Hasta</label>
          <input type="date" className="sf-input" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        <button className="sf-btn" onClick={() => fetchTree(desde, hasta)} disabled={loading}>
          {loading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-magnifying-glass" />} Ver
        </button>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button className="sf-btn sf-btn-secondary" onClick={() => aplicarPreset(1)} disabled={loading}>Ayer</button>
          <button className="sf-btn sf-btn-secondary" onClick={() => aplicarPreset(7)} disabled={loading}>Últimos 7 días</button>
          <button className="sf-btn sf-btn-secondary" onClick={() => aplicarPreset(30)} disabled={loading}>Últimos 30 días</button>
        </div>
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

      {!loading && !error && campaignsFiltradas.length === 0 && (
        <div className="sf-empty">
          <i className="fas fa-bullhorn sf-empty-icon" />
          <p style={{ fontWeight: 600, color: "var(--text-color)" }}>Sin campañas para este período/filtro</p>
        </div>
      )}

      {!loading && campaignsFiltradas.length > 0 && (
        <div className="sf-table-wrap">
          <table className="sf-table">
            <thead>
              <tr>
                <th style={{ width: 24 }} />
                <th style={{ width: 50 }}>Estado</th>
                <th>Nombre</th>
                <th>Presupuesto</th>
                <th style={{ textAlign: "right" }}>Gasto</th>
                <th style={{ textAlign: "right" }}>Impresiones</th>
                <th style={{ textAlign: "right" }}>Clics</th>
                <th style={{ textAlign: "right" }}>CTR</th>
                <th style={{ textAlign: "right" }}>Carritos</th>
                <th style={{ textAlign: "right" }}>Pagos iniciados</th>
                <th style={{ textAlign: "right" }}>Compras</th>
                <th style={{ textAlign: "right" }}>Valor compras</th>
                <th style={{ textAlign: "right" }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {campaignsFiltradas.map(campaign => {
                const campaignExpanded = expandedCampaigns.has(campaign.id);
                return (
                  <Fragment key={campaign.id}>
                    <NodeRow
                      node={campaign}
                      nivel={0}
                      expandible={campaign.adsets.length > 0}
                      expandido={campaignExpanded}
                      onToggleExpand={() => toggleExpand(expandedCampaigns, setExpandedCampaigns, campaign.id)}
                      onToggleStatus={() => handleToggleStatus(campaign)}
                      toggling={togglingIds.has(campaign.id)}
                      editBudget={editBudget}
                      onStartEdit={() => startEditBudget(campaign)}
                      onChangeEdit={v => setEditBudget(prev => prev && { ...prev, value: v })}
                      onCancelEdit={() => setEditBudget(null)}
                      onSaveEdit={() => saveBudget(campaign)}
                      savingBudget={savingBudget}
                    />
                    {campaignExpanded && campaign.adsets.map(adset => {
                      const adsetExpanded = expandedAdsets.has(adset.id);
                      return (
                        <Fragment key={adset.id}>
                          <NodeRow
                            node={adset}
                            nivel={1}
                            expandible={adset.ads.length > 0}
                            expandido={adsetExpanded}
                            onToggleExpand={() => toggleExpand(expandedAdsets, setExpandedAdsets, adset.id)}
                            onToggleStatus={() => handleToggleStatus(adset)}
                            toggling={togglingIds.has(adset.id)}
                            editBudget={editBudget}
                            onStartEdit={() => startEditBudget(adset)}
                            onChangeEdit={v => setEditBudget(prev => prev && { ...prev, value: v })}
                            onCancelEdit={() => setEditBudget(null)}
                            onSaveEdit={() => saveBudget(adset)}
                            savingBudget={savingBudget}
                          />
                          {adsetExpanded && adset.ads.map(ad => (
                            <NodeRow
                              key={ad.id}
                              node={ad}
                              nivel={2}
                              expandible={false}
                              expandido={false}
                              onToggleExpand={() => {}}
                              onToggleStatus={() => handleToggleStatus(ad)}
                              toggling={togglingIds.has(ad.id)}
                              editBudget={editBudget}
                              onStartEdit={() => startEditBudget(ad)}
                              onChangeEdit={v => setEditBudget(prev => prev && { ...prev, value: v })}
                              onCancelEdit={() => setEditBudget(null)}
                              onSaveEdit={() => saveBudget(ad)}
                              savingBudget={savingBudget}
                            />
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
