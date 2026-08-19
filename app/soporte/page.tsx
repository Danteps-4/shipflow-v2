"use client";

import { useState, useEffect, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

const CATEGORIAS = ["Envío", "Producto", "Pago", "Devolución", "Reclamo", "Consulta", "Otro"] as const;
type Categoria = (typeof CATEGORIAS)[number];

// Canal de origen: determina qué dato de contacto tiene sentido pedir.
const PLATAFORMAS = ["WhatsApp", "Instagram", "Email", "Trusty", "Otro"] as const;
type Plataforma = (typeof PLATAFORMAS)[number];

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
  notas: string | null;
  tracking: string | null;
  asignado_a: string | null;
  created_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  telefono: string | null;
  email: string | null;
  instagram: string | null;
  plataforma: string | null;
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

const EMPTY_FORM = {
  titulo: "", descripcion: "", categoria: "Otro" as Categoria,
  plataforma: "" as Plataforma | "", telefono: "", email: "", instagram: "",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function whatsappHref(telefono: string) {
  return `https://wa.me/${telefono.replace(/\D/g, "")}`;
}

function instagramHref(usuario: string) {
  return `https://instagram.com/${usuario.replace(/^@/, "").trim()}`;
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

  const [editingPlataforma, setEditingPlataforma] = useState(false);
  const [plataformaDraft, setPlataformaDraft] = useState<Plataforma | "">("");
  const [editingTelefono, setEditingTelefono] = useState(false);
  const [telefonoDraft, setTelefonoDraft] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [editingInstagram, setEditingInstagram] = useState(false);
  const [instagramDraft, setInstagramDraft] = useState("");
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
    fetchTickets();
    fetchListas();
  }, []);

  useEffect(() => {
    setEditingPlataforma(false);
    setEditingTelefono(false);
    setEditingEmail(false);
    setEditingInstagram(false);
    setEditingAsignado(false);
    setEditingTracking(false);
    setEditingNotas(false);
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
          plataforma: form.plataforma || null,
          telefono: form.telefono.trim() || null,
          email: form.email.trim() || null,
          instagram: form.instagram.trim() || null,
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

  // Campos "vivos" (plataforma, contacto, asignado, tracking, notas): todos
  // usan el mismo endpoint PATCH sin `estado`, así que comparten este helper.
  async function saveCampo(campo: { telefono?: string | null; email?: string | null; instagram?: string | null; plataforma?: string | null; asignadoA?: string | null; tracking?: string | null; notas?: string | null }, onDone: () => void) {
    if (!detailTicket) return;
    setSavingCampo(true);
    try {
      const r = await fetch("/api/soporte/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailTicket.id, ...campo }),
      });
      if (r.ok) {
        const { ticket: updated } = await r.json();
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setDetailTicket(updated);
        onDone();
      }
    } finally {
      setSavingCampo(false);
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
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
                  Plataforma
                  <select
                    className="sf-input"
                    value={form.plataforma}
                    onChange={(e) => setForm((f) => ({ ...f, plataforma: e.target.value as Plataforma }))}
                  >
                    <option value="">Seleccionar...</option>
                    {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </div>

              {/* El campo de contacto cambia según la plataforma elegida:
                  WhatsApp pide teléfono, Instagram pide usuario, Email
                  pide el email del cliente. Trusty/Otro no tienen un
                  contacto directo asociado. */}
              {form.plataforma === "WhatsApp" && (
                <label className="sf-label">
                  Celular
                  <input
                    className="sf-input"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                    placeholder="ej. 5491122334455"
                  />
                </label>
              )}
              {form.plataforma === "Instagram" && (
                <label className="sf-label">
                  Usuario de Instagram
                  <input
                    className="sf-input"
                    value={form.instagram}
                    onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
                    placeholder="ej. @usuario"
                  />
                </label>
              )}
              {form.plataforma === "Email" && (
                <label className="sf-label">
                  Email del cliente
                  <input
                    className="sf-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="ej. cliente@mail.com"
                  />
                </label>
              )}

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

                {editingPlataforma ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <select
                      className="sf-input"
                      style={{ width: 140, padding: "0.2rem 0.5rem", fontSize: "0.78rem" }}
                      value={plataformaDraft}
                      onChange={(e) => setPlataformaDraft(e.target.value as Plataforma)}
                      autoFocus
                    >
                      <option value="">Sin plataforma</option>
                      {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button
                      className="sf-icon-btn"
                      onClick={() => saveCampo({ plataforma: plataformaDraft || null }, () => setEditingPlataforma(false))}
                      disabled={savingCampo}
                      title="Guardar"
                      style={{ width: 24, height: 24, fontSize: "0.65rem" }}
                    >
                      {savingCampo ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
                    </button>
                  </span>
                ) : detailTicket.plataforma ? (
                  <span
                    className="sf-badge"
                    style={{ cursor: "pointer" }}
                    onClick={() => { setPlataformaDraft((detailTicket.plataforma as Plataforma) || ""); setEditingPlataforma(true); }}
                    title="Editar plataforma"
                  >
                    <i className="fas fa-share-nodes" /> {detailTicket.plataforma}
                  </span>
                ) : (
                  <button
                    className="sf-btn sf-btn-secondary"
                    style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem" }}
                    onClick={() => { setPlataformaDraft(""); setEditingPlataforma(true); }}
                  >
                    <i className="fas fa-plus" /> Plataforma
                  </button>
                )}

                <InlineEditBadge
                  icon="fas fa-user" label="Asignado a" value={detailTicket.asignado_a}
                  editing={editingAsignado} draft={asignadoDraft} setDraft={setAsignadoDraft}
                  saving={savingCampo}
                  onStart={() => { setAsignadoDraft(detailTicket.asignado_a || ""); setEditingAsignado(true); }}
                  onCancel={() => setEditingAsignado(false)}
                  onSave={() => saveCampo({ asignadoA: asignadoDraft.trim() || null }, () => setEditingAsignado(false))}
                />

                {detailTicket.lista_id != null && (
                  <span className="sf-badge">
                    <i className="fas fa-list" /> {listas.find((l) => l.id === detailTicket.lista_id)?.nombre ?? "—"}
                  </span>
                )}
              </div>

              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Cargado por {detailTicket.created_by || "—"} · {fmtDateTime(detailTicket.created_at)}
              </span>

              {/* Contacto: se muestran los que ya tengan valor, y se puede
                  agregar cualquiera de los tres sin importar la plataforma
                  actual (por si se cargó a mano o la plataforma cambió). */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <ContactoRow
                  icon="fab fa-whatsapp" iconColor="#25D366" label="Celular"
                  value={detailTicket.telefono} href={detailTicket.telefono ? whatsappHref(detailTicket.telefono) : undefined}
                  editing={editingTelefono} draft={telefonoDraft} setDraft={setTelefonoDraft} saving={savingCampo}
                  placeholder="ej. 5491122334455"
                  onStart={() => { setTelefonoDraft(detailTicket.telefono || ""); setEditingTelefono(true); }}
                  onCancel={() => setEditingTelefono(false)}
                  onSave={() => saveCampo({ telefono: telefonoDraft.trim() || null }, () => setEditingTelefono(false))}
                />
                <ContactoRow
                  icon="fab fa-instagram" iconColor="#e1306c" label="Instagram"
                  value={detailTicket.instagram} href={detailTicket.instagram ? instagramHref(detailTicket.instagram) : undefined}
                  editing={editingInstagram} draft={instagramDraft} setDraft={setInstagramDraft} saving={savingCampo}
                  placeholder="ej. @usuario"
                  onStart={() => { setInstagramDraft(detailTicket.instagram || ""); setEditingInstagram(true); }}
                  onCancel={() => setEditingInstagram(false)}
                  onSave={() => saveCampo({ instagram: instagramDraft.trim() || null }, () => setEditingInstagram(false))}
                />
                <ContactoRow
                  icon="fas fa-envelope" iconColor="#60a5fa" label="Email"
                  value={detailTicket.email} href={detailTicket.email ? `mailto:${detailTicket.email}` : undefined}
                  editing={editingEmail} draft={emailDraft} setDraft={setEmailDraft} saving={savingCampo}
                  placeholder="ej. cliente@mail.com"
                  onStart={() => { setEmailDraft(detailTicket.email || ""); setEditingEmail(true); }}
                  onCancel={() => setEditingEmail(false)}
                  onSave={() => saveCampo({ email: emailDraft.trim() || null }, () => setEditingEmail(false))}
                />
              </div>

              <InlineEditBadge
                icon="fas fa-truck-fast" label="N° de seguimiento" value={detailTicket.tracking}
                editing={editingTracking} draft={trackingDraft} setDraft={setTrackingDraft}
                saving={savingCampo}
                onStart={() => { setTrackingDraft(detailTicket.tracking || ""); setEditingTracking(true); }}
                onCancel={() => setEditingTracking(false)}
                onSave={() => saveCampo({ tracking: trackingDraft.trim() || null }, () => setEditingTracking(false))}
                block
              />

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

              <div>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Notas de seguimiento
                  {!editingNotas && (
                    <button
                      className="sf-icon-btn"
                      title="Editar notas"
                      onClick={() => { setNotasDraft(detailTicket.notas || ""); setEditingNotas(true); }}
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
                ) : detailTicket.notas ? (
                  <p style={{ fontSize: "0.85rem", whiteSpace: "pre-wrap", color: "var(--text-muted)" }}>{detailTicket.notas}</p>
                ) : (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>Sin notas todavía.</p>
                )}
              </div>

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

// Badge chico que muestra "icono: valor" y al click se convierte en un
// input inline para editarlo. Si no hay valor todavía, muestra un botón
// "+ Label" en su lugar. `block` lo hace ocupar toda la fila.
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

// Fila de contacto (celular / instagram / email): si hay valor, muestra un
// link clickeable (WhatsApp, Instagram o mailto) con un lápiz para editar;
// si no, un botón para agregarlo.
function ContactoRow({
  icon, iconColor, label, value, href, editing, draft, setDraft, saving, placeholder, onStart, onCancel, onSave,
}: {
  icon: string; iconColor: string; label: string; value: string | null; href: string | undefined;
  editing: boolean; draft: string; setDraft: (v: string) => void; saving: boolean; placeholder: string;
  onStart: () => void; onCancel: () => void; onSave: () => void;
}) {
  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          className="sf-input"
          style={{ maxWidth: 220 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        />
        <button className="sf-icon-btn" onClick={onSave} disabled={saving} title="Guardar">
          {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
        </button>
        <button className="sf-icon-btn" onClick={onCancel} title="Cancelar">
          <i className="fas fa-times" />
        </button>
      </div>
    );
  }
  if (value && href) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: iconColor, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 600 }}
        >
          <i className={icon} /> {value}
        </a>
        <button className="sf-icon-btn" title={`Editar ${label.toLowerCase()}`} onClick={onStart} style={{ width: 26, height: 26, fontSize: "0.7rem" }}>
          <i className="fas fa-pen" />
        </button>
      </div>
    );
  }
  return (
    <button className="sf-btn sf-btn-secondary" onClick={onStart} style={{ fontSize: "0.78rem", alignSelf: "flex-start" }}>
      <i className={icon} /> Agregar {label.toLowerCase()}
    </button>
  );
}

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
        {t.asignado_a && (
          <span className="sf-badge" style={{ fontSize: "0.7rem" }}>
            <i className="fas fa-user" /> {t.asignado_a}
          </span>
        )}
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
