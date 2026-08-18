"use client";

import { useState, useEffect } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Estado = "pendiente" | "en_proceso" | "resuelto";

const COLUMNAS: { estado: Estado; label: string; icon: string; color: string }[] = [
  { estado: "pendiente", label: "Pendiente", icon: "fas fa-inbox", color: "#f59e0b" },
  { estado: "en_proceso", label: "En proceso", icon: "fas fa-spinner", color: "#3b82f6" },
  { estado: "resuelto", label: "Resuelto", icon: "fas fa-circle-check", color: "#10b981" },
];

interface ReclamoLista {
  id: number;
  nombre: string;
  orden: number;
}

interface ReclamoImagen {
  id: number;
  url: string;
  public_id: string | null;
}

interface Reclamo {
  id: number;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  plataforma: string | null;
  estado: Estado;
  resolucion: string | null;
  notas: string | null;
  tracking: string | null;
  asignado_a: string | null;
  telefono: string | null;
  created_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  lista_id: number | null;
  ticket_origen_id: number | null;
  imagenes: ReclamoImagen[];
}

type ColumnDef =
  | { type: "fixed"; key: string; estado: Estado; label: string; icon: string; color: string }
  | { type: "custom"; key: string; listaId: number; label: string };

const CAT_COLORS: Record<string, string> = {
  "Envío": "#3b82f6",
  "Producto": "#a78bfa",
  "Pago": "#10b981",
  "Devolución": "#ef4444",
  "Reclamo": "#f97316",
  "Consulta": "#06b6d4",
  "Otro": "#6b7280",
};

function catColor(categoria: string): string {
  return CAT_COLORS[categoria] ?? CAT_COLORS["Otro"];
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function whatsappHref(telefono: string) {
  return `https://wa.me/${telefono.replace(/\D/g, "")}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReclamosPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [listas, setListas] = useState<ReclamoLista[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailReclamo, setDetailReclamo] = useState<Reclamo | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [resolverModalOpen, setResolverModalOpen] = useState(false);
  const [resolucionText, setResolucionText] = useState("");
  const [savingResolver, setSavingResolver] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [editingTelefono, setEditingTelefono] = useState(false);
  const [telefonoDraft, setTelefonoDraft] = useState("");
  const [editingPlataforma, setEditingPlataforma] = useState(false);
  const [plataformaDraft, setPlataformaDraft] = useState("");
  const [editingAsignado, setEditingAsignado] = useState(false);
  const [asignadoDraft, setAsignadoDraft] = useState("");
  const [editingTracking, setEditingTracking] = useState(false);
  const [trackingDraft, setTrackingDraft] = useState("");
  const [editingNotas, setEditingNotas] = useState(false);
  const [notasDraft, setNotasDraft] = useState("");
  const [savingCampo, setSavingCampo] = useState(false);

  const [addingLista, setAddingLista] = useState(false);
  const [newListaNombre, setNewListaNombre] = useState("");
  const [creatingLista, setCreatingLista] = useState(false);
  const [deletingListaId, setDeletingListaId] = useState<number | null>(null);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const columns: ColumnDef[] = [
    ...COLUMNAS.map((c) => ({ type: "fixed" as const, key: `estado:${c.estado}`, ...c })),
    ...listas.map((l) => ({ type: "custom" as const, key: `lista:${l.id}`, listaId: l.id, label: l.nombre })),
  ];

  useEffect(() => {
    fetchReclamos();
    fetchListas();
  }, []);

  useEffect(() => {
    setEditingTelefono(false);
    setEditingPlataforma(false);
    setEditingAsignado(false);
    setEditingTracking(false);
    setEditingNotas(false);
  }, [detailReclamo?.id]);

  async function fetchReclamos() {
    setLoading(true);
    try {
      const r = await fetch("/api/reclamos");
      if (r.ok) setReclamos((await r.json()).reclamos ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchListas() {
    const r = await fetch("/api/reclamos/listas");
    if (r.ok) setListas((await r.json()).listas ?? []);
  }

  // ── Listas personalizadas ────────────────────────────────────────────────────

  async function saveNewLista() {
    if (!newListaNombre.trim()) return;
    setCreatingLista(true);
    try {
      const r = await fetch("/api/reclamos/listas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newListaNombre.trim() }),
      });
      if (r.ok) {
        const { lista } = await r.json();
        setListas((prev) => [...prev, lista]);
        setAddingLista(false);
        setNewListaNombre("");
      }
    } finally {
      setCreatingLista(false);
    }
  }

  async function deleteListaFn(id: number) {
    if (!confirm("¿Eliminar esta lista? Las tarjetas que tenga vuelven a Pendiente.")) return;
    setDeletingListaId(id);
    try {
      const r = await fetch("/api/reclamos/listas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) {
        setListas((prev) => prev.filter((l) => l.id !== id));
        await fetchReclamos();
      }
    } finally {
      setDeletingListaId(null);
    }
  }

  // ── Mover / resolver / eliminar ──────────────────────────────────────────────

  async function moveReclamo(reclamo: Reclamo, nuevoEstado: Estado) {
    if (nuevoEstado === "resuelto") {
      setDetailReclamo(reclamo);
      setResolucionText("");
      setResolverModalOpen(true);
      return;
    }
    setMovingId(reclamo.id);
    try {
      const r = await fetch("/api/reclamos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reclamo.id, estado: nuevoEstado }),
      });
      if (r.ok) {
        const { reclamo: updated } = await r.json();
        setReclamos((prev) => prev.map((r2) => (r2.id === updated.id ? updated : r2)));
        setDetailReclamo((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } finally {
      setMovingId(null);
    }
  }

  async function moveReclamoToListaFn(reclamo: Reclamo, listaId: number) {
    setMovingId(reclamo.id);
    try {
      const r = await fetch("/api/reclamos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reclamo.id, listaId }),
      });
      if (r.ok) {
        const { reclamo: updated } = await r.json();
        setReclamos((prev) => prev.map((r2) => (r2.id === updated.id ? updated : r2)));
        setDetailReclamo((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } finally {
      setMovingId(null);
    }
  }

  async function confirmResolver() {
    if (!detailReclamo) return;
    setSavingResolver(true);
    try {
      const r = await fetch("/api/reclamos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailReclamo.id, estado: "resuelto", resolucion: resolucionText || null }),
      });
      if (r.ok) {
        const { reclamo: updated } = await r.json();
        setReclamos((prev) => prev.map((r2) => (r2.id === updated.id ? updated : r2)));
        setDetailReclamo(updated);
        setResolverModalOpen(false);
      }
    } finally {
      setSavingResolver(false);
    }
  }

  async function deleteReclamoFn(id: number) {
    if (!confirm("¿Eliminar este reclamo? No se puede deshacer.")) return;
    setDeletingId(id);
    try {
      const r = await fetch("/api/reclamos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) {
        setReclamos((prev) => prev.filter((r2) => r2.id !== id));
        setDetailReclamo((prev) => (prev?.id === id ? null : prev));
      }
    } finally {
      setDeletingId(null);
    }
  }

  // Campos "vivos" (teléfono, plataforma, asignado, tracking, notas): todos
  // usan el mismo endpoint PATCH sin `estado`, así que comparten este helper.
  async function saveCampo(campo: { telefono?: string | null; plataforma?: string | null; asignadoA?: string | null; tracking?: string | null; notas?: string | null }, onDone: () => void) {
    if (!detailReclamo) return;
    setSavingCampo(true);
    try {
      const r = await fetch("/api/reclamos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailReclamo.id, ...campo }),
      });
      if (r.ok) {
        const { reclamo: updated } = await r.json();
        setReclamos((prev) => prev.map((r2) => (r2.id === updated.id ? updated : r2)));
        setDetailReclamo(updated);
        onDone();
      }
    } finally {
      setSavingCampo(false);
    }
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, id: number) {
    setDraggingId(id);
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverKey(null);
  }

  function handleColDragOver(e: React.DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverKey !== key) setDragOverKey(key);
  }

  function handleColDragLeave(key: string) {
    setDragOverKey((prev) => (prev === key ? null : prev));
  }

  function handleDrop(e: React.DragEvent, col: ColumnDef) {
    e.preventDefault();
    setDragOverKey(null);
    setDraggingId(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    const reclamo = reclamos.find((r) => r.id === id);
    if (!reclamo) return;

    if (col.type === "fixed") {
      if (reclamo.lista_id == null && reclamo.estado === col.estado) return;
      moveReclamo(reclamo, col.estado);
    } else {
      if (reclamo.lista_id === col.listaId) return;
      moveReclamoToListaFn(reclamo, col.listaId);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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

      <main className="sf-main" style={{ maxWidth: "none" }}>
        <div className="sf-container" style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: "0.25rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Reclamos</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Casos convertidos desde Tickets de Soporte. Andá resolviéndolos uno por uno y arrastrá la tarjeta hasta Resuelto.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: "1rem", padding: "1.5rem 2rem", overflowX: "auto", alignItems: "flex-start", justifyContent: "center" }}>
            {columns.map((col) => {
              const items = col.type === "fixed"
                ? reclamos.filter((r) => r.lista_id == null && r.estado === col.estado)
                : reclamos.filter((r) => r.lista_id === col.listaId);
              const isDragOver = dragOverKey === col.key;
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => handleColDragOver(e, col.key)}
                  onDragLeave={() => handleColDragLeave(col.key)}
                  onDrop={(e) => handleDrop(e, col)}
                  style={{
                    flex: "0 0 300px", minWidth: 280, borderRadius: "var(--radius)",
                    outline: isDragOver ? "2px dashed var(--primary-color)" : "2px dashed transparent",
                    outlineOffset: 4, transition: "outline-color 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", padding: "0 0.25rem" }}>
                    {col.type === "fixed" ? (
                      <i className={col.icon} style={{ color: col.color }} />
                    ) : (
                      <i className="fas fa-list" style={{ color: "var(--text-muted)" }} />
                    )}
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{col.label}</span>
                    <span className="sf-tab-badge" style={{ marginLeft: col.type === "fixed" ? "auto" : 0 }}>{items.length}</span>
                    {col.type === "custom" && (
                      <button
                        className="sf-icon-btn"
                        title="Eliminar lista"
                        onClick={() => deleteListaFn(col.listaId)}
                        disabled={deletingListaId === col.listaId}
                        style={{ marginLeft: "auto", width: 26, height: 26, fontSize: "0.72rem" }}
                      >
                        {deletingListaId === col.listaId ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minHeight: 40 }}>
                    {items.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.8rem", border: "1px dashed var(--border-color)", borderRadius: "var(--radius)" }}>
                        Sin tarjetas
                      </div>
                    ) : (
                      items.map((r) => (
                        <ReclamoCard
                          key={r.id}
                          r={r}
                          isDragging={draggingId === r.id}
                          onClick={() => setDetailReclamo(r)}
                          onDragStart={(e) => handleDragStart(e, r.id)}
                          onDragEnd={handleDragEnd}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            <div style={{ flex: "0 0 260px", minWidth: 240 }}>
              {addingLista ? (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input
                    className="sf-input"
                    autoFocus
                    value={newListaNombre}
                    onChange={(e) => setNewListaNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveNewLista();
                      if (e.key === "Escape") setAddingLista(false);
                    }}
                    placeholder="Nombre de la lista"
                  />
                  <button className="sf-btn" onClick={saveNewLista} disabled={creatingLista || !newListaNombre.trim()}>
                    {creatingLista ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
                  </button>
                  <button className="sf-icon-btn" onClick={() => setAddingLista(false)}><i className="fas fa-times" /></button>
                </div>
              ) : (
                <button className="sf-btn sf-btn-secondary" onClick={() => { setAddingLista(true); setNewListaNombre(""); }} style={{ width: "100%" }}>
                  <i className="fas fa-plus" /> Agregar lista
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>

      {/* ── Modal Detalle de reclamo ──────────────────────────────────────────── */}
      {detailReclamo && !resolverModalOpen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setDetailReclamo(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(560px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-triangle-exclamation" style={{ color: catColor(detailReclamo.categoria) }} />
                {detailReclamo.titulo}
              </h3>
              <button className="sf-close-btn" onClick={() => setDetailReclamo(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <span
                  className="sf-badge"
                  style={{ background: catColor(detailReclamo.categoria) + "22", color: catColor(detailReclamo.categoria), border: `1px solid ${catColor(detailReclamo.categoria)}44` }}
                >
                  {detailReclamo.categoria}
                </span>

                <InlineEditBadge
                  icon="fas fa-share-nodes" label="Plataforma" value={detailReclamo.plataforma}
                  editing={editingPlataforma} draft={plataformaDraft} setDraft={setPlataformaDraft}
                  saving={savingCampo}
                  onStart={() => { setPlataformaDraft(detailReclamo.plataforma || ""); setEditingPlataforma(true); }}
                  onCancel={() => setEditingPlataforma(false)}
                  onSave={() => saveCampo({ plataforma: plataformaDraft.trim() || null }, () => setEditingPlataforma(false))}
                />
                <InlineEditBadge
                  icon="fas fa-user" label="Asignado a" value={detailReclamo.asignado_a}
                  editing={editingAsignado} draft={asignadoDraft} setDraft={setAsignadoDraft}
                  saving={savingCampo}
                  onStart={() => { setAsignadoDraft(detailReclamo.asignado_a || ""); setEditingAsignado(true); }}
                  onCancel={() => setEditingAsignado(false)}
                  onSave={() => saveCampo({ asignadoA: asignadoDraft.trim() || null }, () => setEditingAsignado(false))}
                />

                {detailReclamo.lista_id != null && (
                  <span className="sf-badge">
                    <i className="fas fa-list" /> {listas.find((l) => l.id === detailReclamo.lista_id)?.nombre ?? "—"}
                  </span>
                )}
              </div>

              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Cargado por {detailReclamo.created_by || "—"} · {fmtDateTime(detailReclamo.created_at)}
                {detailReclamo.ticket_origen_id != null && <> · Originado del ticket #{detailReclamo.ticket_origen_id}</>}
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {editingTelefono ? (
                  <>
                    <input
                      className="sf-input"
                      style={{ maxWidth: 220 }}
                      value={telefonoDraft}
                      onChange={(e) => setTelefonoDraft(e.target.value)}
                      placeholder="ej. 5491122334455"
                      autoFocus
                    />
                    <button className="sf-icon-btn" onClick={() => saveCampo({ telefono: telefonoDraft.trim() || null }, () => setEditingTelefono(false))} disabled={savingCampo} title="Guardar">
                      {savingCampo ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
                    </button>
                    <button className="sf-icon-btn" onClick={() => setEditingTelefono(false)} title="Cancelar">
                      <i className="fas fa-times" />
                    </button>
                  </>
                ) : detailReclamo.telefono ? (
                  <>
                    <a
                      href={whatsappHref(detailReclamo.telefono)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#25D366", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 600 }}
                    >
                      <i className="fab fa-whatsapp" /> {detailReclamo.telefono}
                    </a>
                    <button
                      className="sf-icon-btn"
                      title="Editar celular"
                      onClick={() => { setTelefonoDraft(detailReclamo.telefono || ""); setEditingTelefono(true); }}
                      style={{ width: 26, height: 26, fontSize: "0.7rem" }}
                    >
                      <i className="fas fa-pen" />
                    </button>
                  </>
                ) : (
                  <button
                    className="sf-btn sf-btn-secondary"
                    onClick={() => { setTelefonoDraft(""); setEditingTelefono(true); }}
                    style={{ fontSize: "0.78rem" }}
                  >
                    <i className="fab fa-whatsapp" /> Agregar celular
                  </button>
                )}
              </div>

              <InlineEditBadge
                icon="fas fa-truck-fast" label="N° de seguimiento" value={detailReclamo.tracking}
                editing={editingTracking} draft={trackingDraft} setDraft={setTrackingDraft}
                saving={savingCampo}
                onStart={() => { setTrackingDraft(detailReclamo.tracking || ""); setEditingTracking(true); }}
                onCancel={() => setEditingTracking(false)}
                onSave={() => saveCampo({ tracking: trackingDraft.trim() || null }, () => setEditingTracking(false))}
                block
              />

              {detailReclamo.descripcion && (
                <p style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{detailReclamo.descripcion}</p>
              )}

              {detailReclamo.imagenes.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {detailReclamo.imagenes.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setPreviewImage(img.url)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      <img src={img.url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Notas de seguimiento
                  {!editingNotas && (
                    <button
                      className="sf-icon-btn"
                      title="Editar notas"
                      onClick={() => { setNotasDraft(detailReclamo.notas || ""); setEditingNotas(true); }}
                      style={{ width: 22, height: 22, fontSize: "0.65rem" }}
                    >
                      <i className="fas fa-pen" />
                    </button>
                  )}
                </label>
                {editingNotas ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <textarea
                      className="sf-input"
                      value={notasDraft}
                      onChange={(e) => setNotasDraft(e.target.value)}
                      placeholder="Ej: se envía abdomen completo, tracking 360..."
                      rows={3}
                      style={{ resize: "vertical", fontFamily: "inherit" }}
                      autoFocus
                    />
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      <button className="sf-btn sf-btn-secondary" onClick={() => setEditingNotas(false)} style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}>Cancelar</button>
                      <button
                        className="sf-btn"
                        onClick={() => saveCampo({ notas: notasDraft.trim() || null }, () => setEditingNotas(false))}
                        disabled={savingCampo}
                        style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}
                      >
                        {savingCampo ? <i className="fas fa-spinner fa-spin" /> : "Guardar"}
                      </button>
                    </div>
                  </div>
                ) : detailReclamo.notas ? (
                  <p style={{ fontSize: "0.85rem", whiteSpace: "pre-wrap", color: "var(--text-muted)" }}>{detailReclamo.notas}</p>
                ) : (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>Sin notas todavía.</p>
                )}
              </div>

              {detailReclamo.estado === "resuelto" && detailReclamo.lista_id == null && (
                <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--success-color)", fontWeight: 700, marginBottom: "0.25rem" }}>
                    <i className="fas fa-circle-check" /> Resuelto por {detailReclamo.resolved_by || "—"} · {detailReclamo.resolved_at ? fmtDateTime(detailReclamo.resolved_at) : ""}
                  </div>
                  {detailReclamo.resolucion && <p style={{ fontSize: "0.85rem" }}>{detailReclamo.resolucion}</p>}
                </div>
              )}
            </div>
            <div className="sf-modal-footer" style={{ justifyContent: "space-between" }}>
              <button className="sf-icon-btn danger" title="Eliminar" onClick={() => deleteReclamoFn(detailReclamo.id)} disabled={deletingId === detailReclamo.id}>
                {deletingId === detailReclamo.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
              </button>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {detailReclamo.estado === "pendiente" && (
                  <button className="sf-btn" onClick={() => moveReclamo(detailReclamo, "en_proceso")} disabled={movingId === detailReclamo.id}>
                    {movingId === detailReclamo.id ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-arrow-right" /> Mover a En proceso</>}
                  </button>
                )}
                {detailReclamo.estado === "en_proceso" && (
                  <>
                    <button className="sf-btn sf-btn-secondary" onClick={() => moveReclamo(detailReclamo, "pendiente")} disabled={movingId === detailReclamo.id}>
                      <i className="fas fa-arrow-left" /> Pendiente
                    </button>
                    <button className="sf-btn" onClick={() => moveReclamo(detailReclamo, "resuelto")} disabled={movingId === detailReclamo.id}>
                      <i className="fas fa-check" /> Resolver
                    </button>
                  </>
                )}
                {detailReclamo.estado === "resuelto" && (
                  <button className="sf-btn sf-btn-secondary" onClick={() => moveReclamo(detailReclamo, "en_proceso")} disabled={movingId === detailReclamo.id}>
                    <i className="fas fa-rotate-left" /> Reabrir
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Resolver (nota de resolución) ───────────────────────────────── */}
      {resolverModalOpen && detailReclamo && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setResolverModalOpen(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(440px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-circle-check" style={{ color: "var(--success-color)" }} />
                Resolver reclamo
              </h3>
              <button className="sf-close-btn" onClick={() => setResolverModalOpen(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text-color)" }}>{detailReclamo.titulo}</strong> va a pasar a Resuelto.
              </p>
              <label className="sf-label">
                Nota de resolución (opcional)
                <textarea
                  className="sf-input"
                  value={resolucionText}
                  onChange={(e) => setResolucionText(e.target.value)}
                  placeholder="Cómo se resolvió..."
                  rows={3}
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                  autoFocus
                />
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setResolverModalOpen(false)}>Cancelar</button>
              <button className="sf-btn" onClick={confirmResolver} disabled={savingResolver}>
                {savingResolver ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Confirmar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Vista previa de imagen ──────────────────────────────────────── */}
      {previewImage && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setPreviewImage(null)} />
          <div
            role="dialog"
            aria-modal="true"
            style={{ position: "fixed", inset: 0, zIndex: 3100, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", pointerEvents: "none" }}
          >
            <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", pointerEvents: "auto" }}>
              <button
                className="sf-close-btn"
                onClick={() => setPreviewImage(null)}
                style={{ position: "absolute", top: "-2.5rem", right: 0, color: "#fff", fontSize: "1.5rem" }}
              >
                <i className="fas fa-times" />
              </button>
              <img src={previewImage} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

// Badge chico que muestra "icono: valor" y al click se convierte en un
// input inline para editarlo. Si no hay valor todavía, muestra un botón
// "+ Label" en su lugar. `block` lo hace ocupar toda la fila (usado para
// el tracking, cuyo valor puede ser largo).
function InlineEditBadge({
  icon, label, value, editing, draft, setDraft, saving, onStart, onCancel, onSave, block,
}: {
  icon: string; label: string; value: string | null;
  editing: boolean; draft: string; setDraft: (v: string) => void; saving: boolean;
  onStart: () => void; onCancel: () => void; onSave: () => void;
  block?: boolean;
}) {
  if (editing) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", width: block ? "100%" : undefined }}>
        <input
          className="sf-input"
          style={{ width: block ? "100%" : 160, padding: "0.2rem 0.5rem", fontSize: "0.78rem" }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={label}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        />
        <button className="sf-icon-btn" onClick={onSave} disabled={saving} title="Guardar" style={{ width: 24, height: 24, fontSize: "0.65rem", flexShrink: 0 }}>
          {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
        </button>
      </span>
    );
  }
  if (value) {
    return (
      <span className="sf-badge" style={{ cursor: "pointer" }} onClick={onStart} title={`Editar ${label.toLowerCase()}`}>
        <i className={icon} /> {value}
      </span>
    );
  }
  return (
    <button className="sf-btn sf-btn-secondary" style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem" }} onClick={onStart}>
      <i className="fas fa-plus" /> {label}
    </button>
  );
}

function ReclamoCard({
  r, onClick, isDragging, onDragStart, onDragEnd,
}: {
  r: Reclamo;
  onClick: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      style={{
        textAlign: "left", background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)",
        borderRadius: "var(--radius)", padding: "0.85rem", cursor: "grab", display: "flex", flexDirection: "column", gap: "0.5rem",
        color: "var(--text-color)", font: "inherit", opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{r.titulo}</span>
        {r.imagenes.length > 0 && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            <i className="fas fa-image" /> {r.imagenes.length}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        <span
          className="sf-badge"
          style={{ background: catColor(r.categoria) + "22", color: catColor(r.categoria), border: `1px solid ${catColor(r.categoria)}44`, fontSize: "0.7rem" }}
        >
          {r.categoria}
        </span>
        {r.asignado_a && (
          <span className="sf-badge" style={{ fontSize: "0.7rem" }}>
            <i className="fas fa-user" /> {r.asignado_a}
          </span>
        )}
        {r.telefono && (
          <a
            href={whatsappHref(r.telefono)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir WhatsApp"
            style={{ color: "#25D366", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 600 }}
          >
            <i className="fab fa-whatsapp" /> {r.telefono}
          </a>
        )}
      </div>
      {r.descripcion && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {r.descripcion}
        </p>
      )}
      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
        {r.created_by || "—"} · {fmtDateTime(r.created_at)}
      </span>
    </div>
  );
}
