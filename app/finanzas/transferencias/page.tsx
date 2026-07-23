"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Transferencia {
  id: number;
  monto: number;
  comprobante_url: string | null;
  comprobante_public_id: string | null;
  numero_pedido: string | null;
  nombre_pedido: string | null;
  enviada: boolean;
  recibida: boolean;
  cierre_id: number | null;
  created_by: string;
  created_at: string;
}

interface TransferenciaCierre {
  id: number;
  created_by: string;
  created_at: string;
  cantidad: number;
  total: number;
  enviadas: number;
  recibidas: number;
  porcentaje: number;
  comision: number;
  neto: number;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransferenciasPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [transferencias, setTransferencias]   = useState<Transferencia[]>([]);
  const [loadingT, setLoadingT]               = useState(true);
  const [cierres, setCierres]                 = useState<TransferenciaCierre[]>([]);
  const [loadingCierres, setLoadingCierres]   = useState(true);
  const [expandedCierre, setExpandedCierre]   = useState<number | null>(null);
  const [cierreDetalle, setCierreDetalle]     = useState<Record<number, Transferencia[]>>({});
  const [cerrandoDia, setCerrandoDia]         = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [editingId, setEditingId]             = useState<number | null>(null);
  const [editingCierreId, setEditingCierreId] = useState<number | null>(null);
  const [nuevoMonto, setNuevoMonto]           = useState("");
  const [nuevoComprobante, setNuevoComprobante] = useState<{ url: string; publicId: string } | null>(null);
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [nuevoNumeroPedido, setNuevoNumeroPedido] = useState("");
  const [nuevoNombrePedido, setNuevoNombrePedido] = useState("");
  const [nuevaEnviada, setNuevaEnviada]       = useState(false);
  const [nuevaRecibida, setNuevaRecibida]     = useState(false);
  const [savingT, setSavingT]                 = useState(false);
  const [guardandoFlagId, setGuardandoFlagId] = useState<number | null>(null);
  const comprobanteInputRef = useRef<HTMLInputElement>(null);

  const [cierreModalOpen, setCierreModalOpen] = useState(false);
  const [porcentajeFinanciera, setPorcentajeFinanciera] = useState("");
  const [porcentajeDefault, setPorcentajeDefault]       = useState(0);
  const [editandoPorcentaje, setEditandoPorcentaje]     = useState(false);
  const [porcentajeEditValue, setPorcentajeEditValue]   = useState("");
  const [savingPorcentaje, setSavingPorcentaje]         = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [eliminandoCierreId, setEliminandoCierreId] = useState<number | null>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchTransferencias();
    fetchCierres();
    fetchPorcentaje();
  }, []);

  async function fetchTransferencias() {
    setLoadingT(true);
    try {
      const r = await fetch("/api/finanzas/transferencias");
      if (r.ok) setTransferencias((await r.json()).transferencias ?? []);
    } finally { setLoadingT(false); }
  }

  async function fetchCierres() {
    setLoadingCierres(true);
    try {
      const r = await fetch("/api/finanzas/transferencias/cierres");
      if (r.ok) setCierres((await r.json()).cierres ?? []);
    } finally { setLoadingCierres(false); }
  }

  async function fetchPorcentaje() {
    const r = await fetch("/api/finanzas/transferencias/porcentaje");
    if (r.ok) setPorcentajeDefault((await r.json()).porcentaje ?? 0);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  function openNewTransferencia() {
    setEditingId(null);
    setEditingCierreId(null);
    setNuevoMonto("");
    setNuevoComprobante(null);
    setNuevoNumeroPedido("");
    setNuevoNombrePedido("");
    setNuevaEnviada(false);
    setNuevaRecibida(false);
    setTransferModalOpen(true);
  }

  // cierreId no-null significa que la transferencia ya está en un cierre
  // cerrado — se puede seguir corrigiendo (ej. un monto mal cargado).
  function openEditTransferencia(t: Transferencia, cierreId: number | null = null) {
    setEditingId(t.id);
    setEditingCierreId(cierreId);
    setNuevoMonto(String(t.monto));
    setNuevoComprobante(
      t.comprobante_url ? { url: t.comprobante_url, publicId: t.comprobante_public_id ?? "" } : null,
    );
    setNuevoNumeroPedido(t.numero_pedido ?? "");
    setNuevoNombrePedido(t.nombre_pedido ?? "");
    setNuevaEnviada(t.enviada);
    setNuevaRecibida(t.recibida);
    setTransferModalOpen(true);
  }

  async function subirComprobante(file: File) {
    setSubiendoComprobante(true);
    try {
      const firmaRes = await fetch("/api/finanzas/upload-signature", { method: "POST" });
      if (!firmaRes.ok) throw new Error("No se pudo firmar la subida");
      const { timestamp, signature, apiKey, cloudName } = await firmaRes.json();

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("signature", signature);
      form.append("folder", "shipflow-finanzas");

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) throw new Error("Error al subir a Cloudinary");
      const data = await uploadRes.json();
      setNuevoComprobante({ url: data.secure_url, publicId: data.public_id });
    } catch {
      alert("No se pudo subir el comprobante. Probá de nuevo.");
    } finally {
      setSubiendoComprobante(false);
    }
  }

  // Permite pegar (Ctrl+V) una imagen copiada de WhatsApp u otra app mientras
  // el modal de nueva transferencia está abierto.
  useEffect(() => {
    if (!transferModalOpen) return;
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) subirComprobante(file);
          e.preventDefault();
          break;
        }
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [transferModalOpen]);

  async function saveTransferencia() {
    const monto = parseFloat(nuevoMonto);
    if (!monto || monto <= 0) return;
    setSavingT(true);
    try {
      const body = {
        monto,
        comprobanteUrl: nuevoComprobante?.url ?? null,
        comprobantePublicId: nuevoComprobante?.publicId ?? null,
        numeroPedido: nuevoNumeroPedido || null,
        nombrePedido: nuevoNombrePedido || null,
        enviada: nuevaEnviada,
        recibida: nuevaRecibida,
      };
      const r = editingId
        ? await fetch("/api/finanzas/transferencias", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...body }),
          })
        : await fetch("/api/finanzas/transferencias", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (r.ok) {
        if (editingId && editingCierreId !== null) {
          // Es una transferencia de un cierre ya cerrado: actualizar solo
          // ese detalle y refrescar los totales (el monto pudo cambiar).
          const { transferencia } = await r.json();
          setCierreDetalle(prev => ({
            ...prev,
            [editingCierreId]: (prev[editingCierreId] ?? []).map(x => x.id === transferencia.id ? transferencia : x),
          }));
          await fetchCierres();
        } else {
          await fetchTransferencias();
        }
        setTransferModalOpen(false);
      }
    } finally {
      setSavingT(false);
    }
  }

  // Tilda enviada/recibida al toque (sin modal), tanto en la lista activa
  // como en el historial ya cerrado — la financiera puede confirmar después.
  async function toggleFlag(t: Transferencia, campo: "enviada" | "recibida", cierreId: number | null) {
    setGuardandoFlagId(t.id);
    try {
      const r = await fetch("/api/finanzas/transferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, [campo]: !t[campo] }),
      });
      if (!r.ok) return;
      const { transferencia } = await r.json();
      if (cierreId === null) {
        setTransferencias(prev => prev.map(x => x.id === t.id ? transferencia : x));
      } else {
        setCierreDetalle(prev => ({
          ...prev,
          [cierreId]: (prev[cierreId] ?? []).map(x => x.id === t.id ? transferencia : x),
        }));
        setCierres(prev => prev.map(c => {
          if (c.id !== cierreId) return c;
          const delta = campo === "enviada"
            ? { enviadas: c.enviadas + (transferencia.enviada ? 1 : -1) }
            : { recibidas: c.recibidas + (transferencia.recibida ? 1 : -1) };
          return { ...c, ...delta };
        }));
      }
    } finally {
      setGuardandoFlagId(null);
    }
  }

  async function deleteTransferencia(id: number) {
    if (!confirm("¿Eliminar esta transferencia?")) return;
    await fetch("/api/finanzas/transferencias", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchTransferencias();
  }

  async function toggleCierre(cierreId: number) {
    if (expandedCierre === cierreId) { setExpandedCierre(null); return; }
    setExpandedCierre(cierreId);
    if (!cierreDetalle[cierreId]) {
      const r = await fetch(`/api/finanzas/transferencias?cierreId=${cierreId}`);
      if (r.ok) {
        const { transferencias: detalle } = await r.json();
        setCierreDetalle(prev => ({ ...prev, [cierreId]: detalle ?? [] }));
      }
    }
  }

  function abrirModalCierre() {
    if (!transferencias.length) return;
    setPorcentajeFinanciera(String(porcentajeDefault));
    setCierreModalOpen(true);
  }

  async function confirmarCierre() {
    const porcentaje = parseFloat(porcentajeFinanciera) || 0;
    if (porcentaje < 0 || porcentaje > 100) return;
    setCerrandoDia(true);
    try {
      const r = await fetch("/api/finanzas/transferencias/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ porcentaje }),
      });
      if (r.ok) {
        await fetchTransferencias();
        await fetchCierres();
        setPorcentajeDefault(porcentaje);
        setCierreModalOpen(false);
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d.error ?? "Error al cerrar el día");
      }
    } finally {
      setCerrandoDia(false);
    }
  }

  function abrirEditarPorcentaje() {
    setPorcentajeEditValue(String(porcentajeDefault));
    setEditandoPorcentaje(true);
  }

  async function guardarPorcentajeDefault() {
    const porcentaje = parseFloat(porcentajeEditValue) || 0;
    if (porcentaje < 0 || porcentaje > 100) return;
    setSavingPorcentaje(true);
    try {
      const r = await fetch("/api/finanzas/transferencias/porcentaje", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ porcentaje }),
      });
      if (r.ok) {
        setPorcentajeDefault((await r.json()).porcentaje ?? porcentaje);
        setEditandoPorcentaje(false);
      }
    } finally {
      setSavingPorcentaje(false);
    }
  }

  async function eliminarCierre(cierreId: number) {
    if (!confirm("¿Eliminar este cierre? Se van a borrar también todas las transferencias que quedaron agrupadas ahí. Esta acción no se puede deshacer.")) return;
    setEliminandoCierreId(cierreId);
    try {
      const r = await fetch("/api/finanzas/transferencias/cierres", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cierreId }),
      });
      if (r.ok) {
        setCierres(prev => prev.filter(c => c.id !== cierreId));
        setCierreDetalle(prev => {
          const next = { ...prev };
          delete next[cierreId];
          return next;
        });
        if (expandedCierre === cierreId) setExpandedCierre(null);
      }
    } finally {
      setEliminandoCierreId(null);
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

      <main className="sf-main">
        <div className="sf-container">

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Transferencias</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Transferencias desviadas a la financiera: cargá el comprobante, marcá enviada/recibida, y cerrá el día cuando termines.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <button className="sf-btn" onClick={openNewTransferencia}>
              <i className="fas fa-plus" /> Agregar transferencia
            </button>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
              <div style={{ fontSize: "0.9rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Total activo: </span>
                <strong style={{ fontFamily: "monospace" }}>
                  {fmtMoney(transferencias.reduce((s, t) => s + Number(t.monto), 0))}
                </strong>
                <span style={{ color: "var(--text-muted)" }}> ({transferencias.length})</span>
              </div>
              <button className="sf-btn sf-btn-secondary" onClick={abrirModalCierre} disabled={!transferencias.length || cerrandoDia}>
                {cerrandoDia
                  ? <><i className="fas fa-spinner fa-spin" /> Cerrando…</>
                  : <><i className="fas fa-lock" /> Cerrar el día</>
                }
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "1rem", fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            Comisión fija de la financiera: <strong style={{ color: "var(--text-color)" }}>{porcentajeDefault}%</strong>
            <button className="sf-icon-btn" title="Editar comisión fija" onClick={abrirEditarPorcentaje}>
              <i className="fas fa-pen" style={{ fontSize: "0.7rem" }} />
            </button>
          </div>

          {loadingT ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
            </div>
          ) : transferencias.length === 0 ? (
            <EmptyState icon="fas fa-money-bill-transfer" text="No hay transferencias cargadas todavía." />
          ) : (
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead>
                  <tr>
                    <th>Comprobante</th>
                    <th>Pedido</th>
                    <th style={{ textAlign: "right" }}>Monto</th>
                    <th>Enviada</th>
                    <th>Recibida</th>
                    <th style={{ width: 70 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {transferencias.map(t => (
                    <TransferenciaRow
                      key={t.id}
                      t={t}
                      onToggle={campo => toggleFlag(t, campo, null)}
                      onEdit={() => openEditTransferencia(t)}
                      onDelete={() => deleteTransferencia(t.id)}
                      onPreview={setPreviewImage}
                      saving={guardandoFlagId === t.id}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Total</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                      {fmtMoney(transferencias.reduce((s, t) => s + Number(t.monto), 0))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <hr className="sf-divider" style={{ margin: "2rem 0" }} />

          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.25rem" }}>Historial de cierres</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            Los días ya cerrados. Podés seguir marcando &quot;Recibida&quot; cuando la financiera confirme.
          </p>

          {loadingCierres ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.3rem" }} />
            </div>
          ) : cierres.length === 0 ? (
            <EmptyState icon="fas fa-clock-rotate-left" text="Todavía no cerraste ningún día." />
          ) : (
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}></th>
                    <th>Cierre</th>
                    <th style={{ textAlign: "right" }}>Cantidad</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ textAlign: "right" }}>% Financiera</th>
                    <th style={{ textAlign: "right" }}>Comisión</th>
                    <th style={{ textAlign: "right" }}>Neto</th>
                    <th style={{ textAlign: "right" }}>Enviadas</th>
                    <th style={{ textAlign: "right" }}>Recibidas</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.map(c => {
                    const expanded = expandedCierre === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr style={{ cursor: "pointer" }} onClick={() => toggleCierre(c.id)}>
                          <td>
                            <i className={`fas fa-chevron-${expanded ? "down" : "right"}`} style={{ fontSize: "0.7rem", color: "var(--text-muted)" }} />
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.created_at)}</td>
                          <td style={{ textAlign: "right" }}>{c.cantidad}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtMoney(c.total)}</td>
                          <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{c.porcentaje}%</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", color: "var(--warning-color)" }}>{fmtMoney(c.comision)}</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(c.neto)}</td>
                          <td style={{ textAlign: "right", color: c.enviadas === c.cantidad ? "var(--success-color)" : "var(--text-muted)" }}>
                            {c.enviadas} / {c.cantidad}
                          </td>
                          <td style={{ textAlign: "right", color: c.recibidas === c.cantidad ? "var(--success-color)" : "var(--warning-color)" }}>
                            {c.recibidas} / {c.cantidad}
                          </td>
                          <td>
                            <button
                              className="sf-icon-btn danger"
                              title="Eliminar cierre"
                              onClick={e => { e.stopPropagation(); eliminarCierre(c.id); }}
                              disabled={eliminandoCierreId === c.id}
                            >
                              {eliminandoCierreId === c.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={10} style={{ padding: 0, background: "rgba(15,23,42,0.3)" }}>
                              {!cierreDetalle[c.id] ? (
                                <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)" }}>
                                  <i className="fas fa-spinner fa-spin" />
                                </div>
                              ) : (
                                <table className="sf-table" style={{ margin: 0 }}>
                                  <tbody>
                                    {cierreDetalle[c.id].map(t => (
                                      <TransferenciaRow
                                        key={t.id}
                                        t={t}
                                        onToggle={campo => toggleFlag(t, campo, c.id)}
                                        onEdit={() => openEditTransferencia(t, c.id)}
                                        onPreview={setPreviewImage}
                                        saving={guardandoFlagId === t.id}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>

      {/* ── Modal Transferencia ──────────────────────────────────────────────── */}
      {transferModalOpen && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setTransferModalOpen(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(480px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-money-bill-transfer" style={{ color: "var(--primary-color)" }} />
                {editingId ? "Editar transferencia" : "Nueva transferencia"}
              </h3>
              <button className="sf-close-btn" onClick={() => setTransferModalOpen(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="sf-label">
                Comprobante
                <div
                  className="sf-dropzone"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) subirComprobante(f); }}
                  onClick={() => comprobanteInputRef.current?.click()}
                >
                  <input
                    ref={comprobanteInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) subirComprobante(f); e.target.value = ""; }}
                  />
                  {subiendoComprobante ? (
                    <>
                      <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem", color: "var(--primary-color)" }} />
                      <span style={{ fontWeight: 600 }}>Subiendo…</span>
                    </>
                  ) : nuevoComprobante ? (
                    <>
                      <i className="fas fa-circle-check" style={{ fontSize: "1.5rem", color: "var(--success-color)" }} />
                      <span style={{ fontWeight: 600 }}>Comprobante cargado</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click para cambiar</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-cloud-arrow-up" style={{ fontSize: "1.5rem", color: "var(--text-muted)" }} />
                      <span style={{ fontWeight: 600 }}>Arrastrá, hacé click o pegá con Ctrl+V</span>
                    </>
                  )}
                </div>
              </label>
              <label className="sf-label">
                Monto ($)
                <input
                  className="sf-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevoMonto}
                  onChange={e => setNuevoMonto(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Número de pedido
                  <input
                    className="sf-input"
                    value={nuevoNumeroPedido}
                    onChange={e => setNuevoNumeroPedido(e.target.value)}
                    placeholder="ej. 1234"
                  />
                </label>
                <label className="sf-label">
                  Nombre del pedido
                  <input
                    className="sf-input"
                    value={nuevoNombrePedido}
                    onChange={e => setNuevoNombrePedido(e.target.value)}
                    placeholder="ej. Juan Pérez"
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={nuevaEnviada} onChange={e => setNuevaEnviada(e.target.checked)} />
                  Ya la enviamos a la financiera
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={nuevaRecibida} onChange={e => setNuevaRecibida(e.target.checked)} />
                  Ya está recibida
                </label>
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setTransferModalOpen(false)}>Cancelar</button>
              <button
                className="sf-btn"
                onClick={saveTransferencia}
                disabled={savingT || !nuevoMonto || subiendoComprobante}
              >
                {savingT ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Cerrar el día ──────────────────────────────────────────────── */}
      {cierreModalOpen && (() => {
        const total = transferencias.reduce((s, t) => s + Number(t.monto), 0);
        const porcentaje = parseFloat(porcentajeFinanciera) || 0;
        const comision = Math.round(total * porcentaje) / 100;
        const neto = total - comision;
        return (
          <>
            <div className="sf-modal-backdrop" onClick={() => setCierreModalOpen(false)} />
            <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(420px, calc(100vw - 2rem))" }}>
              <div className="sf-modal-header">
                <h3 className="sf-modal-title">
                  <i className="fas fa-lock" style={{ color: "var(--primary-color)" }} />
                  Cerrar el día
                </h3>
                <button className="sf-close-btn" onClick={() => setCierreModalOpen(false)}>
                  <i className="fas fa-times" />
                </button>
              </div>
              <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Vas a cerrar {transferencias.length} transferencia{transferencias.length !== 1 ? "s" : ""} por un total de{" "}
                  <strong style={{ color: "var(--text-color)" }}>{fmtMoney(total)}</strong>. Empezás una cuenta nueva en cero.
                </p>
                <label className="sf-label">
                  Porcentaje que cobra la financiera (%)
                  <input
                    className="sf-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={porcentajeFinanciera}
                    onChange={e => setPorcentajeFinanciera(e.target.value)}
                    placeholder="0"
                    autoFocus
                  />
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", background: "rgba(15,23,42,0.4)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Comisión</span>
                    <strong style={{ fontFamily: "monospace", color: "var(--warning-color)" }}>{fmtMoney(comision)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Neto a depositar</span>
                    <strong style={{ fontFamily: "monospace" }}>{fmtMoney(neto)}</strong>
                  </div>
                </div>
              </div>
              <div className="sf-modal-footer">
                <button className="sf-btn sf-btn-secondary" onClick={() => setCierreModalOpen(false)}>Cancelar</button>
                <button
                  className="sf-btn"
                  onClick={confirmarCierre}
                  disabled={cerrandoDia || porcentaje < 0 || porcentaje > 100}
                >
                  {cerrandoDia ? <><i className="fas fa-spinner fa-spin" /> Cerrando…</> : <><i className="fas fa-lock" /> Confirmar cierre</>}
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Modal Editar comisión fija ───────────────────────────────────────── */}
      {editandoPorcentaje && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setEditandoPorcentaje(false)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(360px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-percent" style={{ color: "var(--primary-color)" }} />
                Comisión fija de la financiera
              </h3>
              <button className="sf-close-btn" onClick={() => setEditandoPorcentaje(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="sf-label">
                Porcentaje (%)
                <input
                  className="sf-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={porcentajeEditValue}
                  onChange={e => setPorcentajeEditValue(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </label>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Se va a usar como valor por defecto la próxima vez que cierres el día, para no tener que cargarlo de nuevo.
              </p>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setEditandoPorcentaje(false)}>Cancelar</button>
              <button className="sf-btn" onClick={guardarPorcentajeDefault} disabled={savingPorcentaje}>
                {savingPorcentaje ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Vista previa de imagen ─────────────────────────────────────── */}
      {previewImage && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setPreviewImage(null)} />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed", inset: 0, zIndex: 3100,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "2rem", pointerEvents: "none",
            }}
          >
            <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", pointerEvents: "auto" }}>
              <button
                className="sf-close-btn"
                onClick={() => setPreviewImage(null)}
                style={{
                  position: "absolute", top: "-2.5rem", right: 0,
                  color: "#fff", fontSize: "1.5rem",
                }}
              >
                <i className="fas fa-times" />
              </button>
              <img
                src={previewImage}
                alt="Comprobante"
                style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
      <i className={icon} style={{ fontSize: "2rem", marginBottom: "0.75rem", display: "block", opacity: 0.4 }} />
      <p style={{ fontSize: "0.9rem" }}>{text}</p>
    </div>
  );
}

interface TransferenciaFE {
  id: number;
  monto: number;
  comprobante_url: string | null;
  numero_pedido: string | null;
  nombre_pedido: string | null;
  enviada: boolean;
  recibida: boolean;
}

function TransferenciaRow({ t, onToggle, onEdit, onDelete, onPreview, saving }: {
  t: TransferenciaFE;
  onToggle: (campo: "enviada" | "recibida") => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPreview?: (url: string) => void;
  saving: boolean;
}) {
  return (
    <tr>
      <td>
        {t.comprobante_url ? (
          <button
            type="button"
            onClick={() => onPreview?.(t.comprobante_url!)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            title="Ver comprobante"
          >
            <img src={t.comprobante_url} alt="Comprobante" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
          </button>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>
        )}
      </td>
      <td>
        {t.numero_pedido || t.nombre_pedido ? (
          <>
            {t.numero_pedido && <div style={{ fontWeight: 600 }}>#{t.numero_pedido}</div>}
            {t.nombre_pedido && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.nombre_pedido}</div>}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>
        )}
      </td>
      <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtMoney(Number(t.monto))}</td>
      <td>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: saving ? "default" : "pointer" }}>
          <input type="checkbox" checked={t.enviada} disabled={saving} onChange={() => onToggle("enviada")} />
          <span style={{ fontSize: "0.82rem", color: t.enviada ? "var(--success-color)" : "var(--text-muted)" }}>
            {t.enviada ? "Enviada" : "Pendiente"}
          </span>
        </label>
      </td>
      <td>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: saving ? "default" : "pointer" }}>
          <input type="checkbox" checked={t.recibida} disabled={saving} onChange={() => onToggle("recibida")} />
          <span style={{ fontSize: "0.82rem", color: t.recibida ? "var(--success-color)" : "var(--warning-color)" }}>
            {t.recibida ? "Recibida" : "Pendiente"}
          </span>
        </label>
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {onEdit && (
            <button className="sf-icon-btn" title="Editar" onClick={onEdit}>
              <i className="fas fa-pen" />
            </button>
          )}
          {onDelete && (
            <button className="sf-icon-btn danger" title="Eliminar" onClick={onDelete}>
              <i className="fas fa-trash" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
