"use client";

import { useState, useEffect, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

const CATEGORIAS = ["Envío", "Producto", "Pago", "Devolución", "Reclamo", "Consulta", "Otro"] as const;
type Categoria = (typeof CATEGORIAS)[number];

type Estado = "pendiente" | "en_proceso" | "resuelto";

const COLUMNAS: { estado: Estado; label: string; icon: string; color: string }[] = [
  { estado: "pendiente", label: "Pendiente", icon: "fas fa-inbox", color: "#f59e0b" },
  { estado: "en_proceso", label: "En proceso", icon: "fas fa-spinner", color: "#3b82f6" },
  { estado: "resuelto", label: "Resuelto", icon: "fas fa-circle-check", color: "#10b981" },
];

interface TicketLista {
  id: number;
  nombre: string;
  orden: number;
}

interface TicketImagen {
  id: number;
  url: string;
  public_id: string | null;
}

interface Ticket {
  id: number;
  titulo: string;
  descripcion: string | null;
  categoria: Categoria;
  estado: Estado;
  resolucion: string | null;
  created_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  telefono: string | null;
  lista_id: number | null;
  imagenes: TicketImagen[];
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

const EMPTY_FORM = { titulo: "", descripcion: "", categoria: "Otro" as Categoria, telefono: "" };

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function whatsappHref(telefono: string) {
  return `https://wa.me/${telefono.replace(/\D/g, "")}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SoportePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [listas, setListas] = useState<TicketLista[]>([]);
  const [loading, setLoading] = useState(true);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imagenes, setImagenes] = useState<{ url: string; publicId: string | null }[]>([]);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [resolverModalOpen, setResolverModalOpen] = useState(false);
  const [resolucionText, setResolucionText] = useState("");
  const [savingResolver, setSavingResolver] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [editingTelefono, setEditingTelefono] = useState(false);
  const [telefonoDraft, setTelefonoDraft] = useState("");
  const [savingTelefono, setSavingTelefono] = useState(false);

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
    fetchTickets();
    fetchListas();
  }, []);

  useEffect(() => {
    setEditingTelefono(false);
  }, [detailTicket?.id]);

  async function fetchTickets() {
    setLoading(true);
    try {
      const r = await fetch("/api/soporte/tickets");
      if (r.ok) setTickets((await r.json()).tickets ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchListas() {
    const r = await fetch("/api/soporte/listas");
    if (r.ok) setListas((await r.json()).listas ?? []);
  }

  // ── Listas personalizadas ────────────────────────────────────────────────────

  async function saveNewLista() {
    if (!newListaNombre.trim()) return;
    setCreatingLista(true);
    try {
      const r = await fetch("/api/soporte/listas", {
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
      const r = await fetch("/api/soporte/listas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) {
        setListas((prev) => prev.filter((l) => l.id !== id));
        await fetchTickets();
      }
    } finally {
      setDeletingListaId(null);
    }
  }

  // ── Nueva tarjeta ────────────────────────────────────────────────────────────

  function openNewTicket() {
    setForm(EMPTY_FORM);
    setImagenes([]);
    setNewModalOpen(true);
  }

  async function subirImagen(file: File) {
    setSubiendoImagen(true);
    try {
      const firmaRes = await fetch("/api/soporte/upload-signature", { method: "POST" });
      if (!firmaRes.ok) throw new Error("No se pudo firmar la subida");
      const { timestamp, signature, apiKey, cloudName } = await firmaRes.json();

      const body = new FormData();
      body.append("file", file);
      body.append("api_key", apiKey);
      body.append("timestamp", String(timestamp));
      body.append("signature", signature);
      body.append("folder", "shipflow-soporte");

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: "POST", body });
      if (!uploadRes.ok) throw new Error("Error al subir a Cloudinary");
      const data = await uploadRes.json();
      setImagenes((prev) => [...prev, { url: data.secure_url, publicId: data.public_id }]);
    } catch {
      alert("No se pudo subir la imagen. Probá de nuevo.");
    } finally {
      setSubiendoImagen(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => subirImagen(f));
  }

  // Permite pegar (Ctrl+V) una imagen copiada de WhatsApp u otra app mientras
  // el modal de nueva tarjeta está abierto.
  useEffect(() => {
    if (!newModalOpen) return;
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) subirImagen(file);
          e.preventDefault();
        }
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [newModalOpen]);

  function removeImagenDeForm(idx: number) {
    setImagenes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveNewTicket() {
    if (!form.titulo.trim()) return;
    setSavingNew(true);
    try {
      const r = await fetch("/api/soporte/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo,
          descripcion: form.descripcion || null,
          categoria: form.categoria,
          telefono: form.telefono.trim() || null,
          imagenes,
        }),
      });
      if (r.ok) { await fetchTickets(); setNewModalOpen(false); }
    } finally {
      setSavingNew(false);
    }
  }

  // ── Mover / resolver / eliminar ──────────────────────────────────────────────

  async function moveTicket(ticket: Ticket, nuevoEstado: Estado) {
    if (nuevoEstado === "resuelto") {
      setDetailTicket(ticket);
      setResolucionText("");
      setResolverModalOpen(true);
      return;
    }
    setMovingId(ticket.id);
    try {
      const r = await fetch("/api/soporte/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, estado: nuevoEstado }),
      });
      if (r.ok) {
        const { ticket: updated } = await r.json();
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setDetailTicket((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } finally {
      setMovingId(null);
    }
  }

  async function moveTicketToListaFn(ticket: Ticket, listaId: number) {
    setMovingId(ticket.id);
    try {
      const r = await fetch("/api/soporte/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, listaId }),
      });
      if (r.ok) {
        const { ticket: updated } = await r.json();
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setDetailTicket((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } finally {
      setMovingId(null);
    }
  }

  async function confirmResolver() {
    if (!detailTicket) return;
    setSavingResolver(true);
    try {
      const r = await fetch("/api/soporte/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailTicket.id, estado: "resuelto", resolucion: resolucionText || null }),
      });
      if (r.ok) {
        const { ticket: updated } = await r.json();
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setDetailTicket(updated);
        setResolverModalOpen(false);
      }
    } finally {
      setSavingResolver(false);
    }
  }

  async function deleteTicketFn(id: number) {
    if (!confirm("¿Eliminar esta tarjeta? No se puede deshacer.")) return;
    setDeletingId(id);
    try {
      const r = await fetch("/api/soporte/tickets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) {
        setTickets((prev) => prev.filter((t) => t.id !== id));
        setDetailTicket((prev) => (prev?.id === id ? null : prev));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function saveTelefono() {
    if (!detailTicket) return;
    setSavingTelefono(true);
    try {
      const r = await fetch("/api/soporte/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailTicket.id, telefono: telefonoDraft.trim() || null }),
      });
      if (r.ok) {
        const { ticket: updated } = await r.json();
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setDetailTicket(updated);
        setEditingTelefono(false);
      }
    } finally {
      setSavingTelefono(false);
    }
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, ticketId: number) {
    setDraggingId(ticketId);
    e.dataTransfer.setData("text/plain", String(ticketId));
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
    const ticketId = Number(e.dataTransfer.getData("text/plain"));
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    if (col.type === "fixed") {
      if (ticket.lista_id == null && ticket.estado === col.estado) return;
      moveTicket(ticket, col.estado);
    } else {
      if (ticket.lista_id === col.listaId) return;
      moveTicketToListaFn(ticket, col.listaId);
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "0.25rem" }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Soporte</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Cargá el problema del cliente en Pendiente y arrastrá la tarjeta entre listas hasta resolverlo.
              </p>
            </div>
            <button className="sf-btn" onClick={openNewTicket}>
              <i className="fas fa-plus" /> Nueva tarjeta
            </button>
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
                ? tickets.filter((t) => t.lista_id == null && t.estado === col.estado)
                : tickets.filter((t) => t.lista_id === col.listaId);
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
                      items.map((t) => (
                        <TicketCard
                          key={t.id}
                          t={t}
                          isDragging={draggingId === t.id}
                          onClick={() => setDetailTicket(t)}
                          onDragStart={(e) => handleDragStart(e, t.id)}
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

      {/* ── Modal Nueva tarjeta ───────────────────────────────────────────────── */}
      {newModalOpen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setNewModalOpen(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(520px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-headset" style={{ color: "var(--primary-color)" }} />
                Nueva tarjeta
              </h3>
              <button className="sf-close-btn" onClick={() => setNewModalOpen(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="sf-label">
                Título
                <input
                  className="sf-input"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="ej. Pedido #1234 llegó dañado"
                  autoFocus
                />
              </label>
              <label className="sf-label">
                Categoría
                <select
                  className="sf-input"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as Categoria }))}
                >
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="sf-label">
                Celular (opcional)
                <input
                  className="sf-input"
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  placeholder="ej. 5491122334455"
                />
              </label>
              <label className="sf-label">
                Descripción
                <textarea
                  className="sf-input"
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Contá qué pasó..."
                  rows={4}
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
              </label>
              <label className="sf-label">
                Imágenes
                <div
                  className="sf-dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                    onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
                  />
                  {subiendoImagen ? (
                    <>
                      <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem", color: "var(--primary-color)" }} />
                      <span style={{ fontWeight: 600 }}>Subiendo…</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-cloud-arrow-up" style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} />
                      <span style={{ fontWeight: 600 }}>Arrastrá, hacé click o pegá con Ctrl+V</span>
                    </>
                  )}
                </div>
              </label>
              {imagenes.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {imagenes.map((img, idx) => (
                    <div key={img.url} style={{ position: "relative" }}>
                      <img src={img.url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
                      <button
                        type="button"
                        onClick={() => removeImagenDeForm(idx)}
                        title="Quitar"
                        style={{
                          position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                          background: "var(--error-color)", color: "#fff", border: "none", cursor: "pointer",
                          fontSize: "0.65rem", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setNewModalOpen(false)}>Cancelar</button>
              <button className="sf-btn" onClick={saveNewTicket} disabled={savingNew || !form.titulo.trim() || subiendoImagen}>
                {savingNew ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Detalle de tarjeta ──────────────────────────────────────────── */}
      {detailTicket && !resolverModalOpen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setDetailTicket(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(560px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-headset" style={{ color: CAT_COLORS[detailTicket.categoria] }} />
                {detailTicket.titulo}
              </h3>
              <button className="sf-close-btn" onClick={() => setDetailTicket(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <span
                  className="sf-badge"
                  style={{
                    background: CAT_COLORS[detailTicket.categoria] + "22", color: CAT_COLORS[detailTicket.categoria],
                    border: `1px solid ${CAT_COLORS[detailTicket.categoria]}44`,
                  }}
                >
                  {detailTicket.categoria}
                </span>
                {detailTicket.lista_id != null && (
                  <span className="sf-badge">
                    <i className="fas fa-list" /> {listas.find((l) => l.id === detailTicket.lista_id)?.nombre ?? "—"}
                  </span>
                )}
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Cargado por {detailTicket.created_by || "—"} · {fmtDateTime(detailTicket.created_at)}
                </span>
              </div>

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
                    <button className="sf-icon-btn" onClick={saveTelefono} disabled={savingTelefono} title="Guardar">
                      {savingTelefono ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
                    </button>
                    <button className="sf-icon-btn" onClick={() => setEditingTelefono(false)} title="Cancelar">
                      <i className="fas fa-times" />
                    </button>
                  </>
                ) : detailTicket.telefono ? (
                  <>
                    <a
                      href={whatsappHref(detailTicket.telefono)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#25D366", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 600 }}
                    >
                      <i className="fab fa-whatsapp" /> {detailTicket.telefono}
                    </a>
                    <button
                      className="sf-icon-btn"
                      title="Editar celular"
                      onClick={() => { setTelefonoDraft(detailTicket.telefono || ""); setEditingTelefono(true); }}
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

              {detailTicket.descripcion && (
                <p style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{detailTicket.descripcion}</p>
              )}

              {detailTicket.imagenes.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {detailTicket.imagenes.map((img) => (
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

              {detailTicket.estado === "resuelto" && detailTicket.lista_id == null && (
                <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--success-color)", fontWeight: 700, marginBottom: "0.25rem" }}>
                    <i className="fas fa-circle-check" /> Resuelto por {detailTicket.resolved_by || "—"} · {detailTicket.resolved_at ? fmtDateTime(detailTicket.resolved_at) : ""}
                  </div>
                  {detailTicket.resolucion && <p style={{ fontSize: "0.85rem" }}>{detailTicket.resolucion}</p>}
                </div>
              )}
            </div>
            <div className="sf-modal-footer" style={{ justifyContent: "space-between" }}>
              <button className="sf-icon-btn danger" title="Eliminar" onClick={() => deleteTicketFn(detailTicket.id)} disabled={deletingId === detailTicket.id}>
                {deletingId === detailTicket.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
              </button>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {detailTicket.estado === "pendiente" && (
                  <button className="sf-btn" onClick={() => moveTicket(detailTicket, "en_proceso")} disabled={movingId === detailTicket.id}>
                    {movingId === detailTicket.id ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-arrow-right" /> Mover a En proceso</>}
                  </button>
                )}
                {detailTicket.estado === "en_proceso" && (
                  <>
                    <button className="sf-btn sf-btn-secondary" onClick={() => moveTicket(detailTicket, "pendiente")} disabled={movingId === detailTicket.id}>
                      <i className="fas fa-arrow-left" /> Pendiente
                    </button>
                    <button className="sf-btn" onClick={() => moveTicket(detailTicket, "resuelto")} disabled={movingId === detailTicket.id}>
                      <i className="fas fa-check" /> Resolver
                    </button>
                  </>
                )}
                {detailTicket.estado === "resuelto" && (
                  <button className="sf-btn sf-btn-secondary" onClick={() => moveTicket(detailTicket, "en_proceso")} disabled={movingId === detailTicket.id}>
                    <i className="fas fa-rotate-left" /> Reabrir
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Resolver (nota de resolución) ───────────────────────────────── */}
      {resolverModalOpen && detailTicket && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setResolverModalOpen(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(440px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-circle-check" style={{ color: "var(--success-color)" }} />
                Resolver tarjeta
              </h3>
              <button className="sf-close-btn" onClick={() => setResolverModalOpen(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text-color)" }}>{detailTicket.titulo}</strong> va a pasar a Resuelto.
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

function TicketCard({
  t, onClick, isDragging, onDragStart, onDragEnd,
}: {
  t: Ticket;
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
        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{t.titulo}</span>
        {t.imagenes.length > 0 && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            <i className="fas fa-image" /> {t.imagenes.length}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        <span
          className="sf-badge"
          style={{
            background: CAT_COLORS[t.categoria] + "22", color: CAT_COLORS[t.categoria],
            border: `1px solid ${CAT_COLORS[t.categoria]}44`, fontSize: "0.7rem",
          }}
        >
          {t.categoria}
        </span>
        {t.telefono && (
          <a
            href={whatsappHref(t.telefono)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir WhatsApp"
            style={{ color: "#25D366", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 600 }}
          >
            <i className="fab fa-whatsapp" /> {t.telefono}
          </a>
        )}
      </div>
      {t.descripcion && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {t.descripcion}
        </p>
      )}
      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
        {t.created_by || "—"} · {fmtDateTime(t.created_at)}
      </span>
    </div>
  );
}
