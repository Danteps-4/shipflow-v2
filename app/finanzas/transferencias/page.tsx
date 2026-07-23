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
  const [nuevoMonto, setNuevoMonto]           = useState("");
  const [nuevoComprobante, setNuevoComprobante] = useState<{ url: string; publicId: string } | null>(null);
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [nuevaEnviada, setNuevaEnviada]       = useState(false);
  const [nuevaRecibida, setNuevaRecibida]     = useState(false);
  const [savingT, setSavingT]                 = useState(false);
  const [guardandoFlagId, setGuardandoFlagId] = useState<number | null>(null);
  const comprobanteInputRef = useRef<HTMLInputElement>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchTransferencias();
    fetchCierres();
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

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  function openNewTransferencia() {
    setNuevoMonto("");
    setNuevoComprobante(null);
    setNuevaEnviada(false);
    setNuevaRecibida(false);
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
      const r = await fetch("/api/finanzas/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto,
          comprobanteUrl: nuevoComprobante?.url ?? null,
          comprobantePublicId: nuevoComprobante?.publicId ?? null,
          enviada: nuevaEnviada,
          recibida: nuevaRecibida,
        }),
      });
      if (r.ok) { await fetchTransferencias(); setTransferModalOpen(false); }
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

  async function cerrarDia() {
    if (!transferencias.length) return;
    const total = transferencias.reduce((s, t) => s + Number(t.monto), 0);
    if (!confirm(`¿Cerrar el día con ${transferencias.length} transferencia${transferencias.length !== 1 ? "s" : ""} por un total de ${fmtMoney(total)}? Empezás una cuenta nueva en cero.`)) return;
    setCerrandoDia(true);
    try {
      const r = await fetch("/api/finanzas/transferencias/cerrar", { method: "POST" });
      if (r.ok) {
        await fetchTransferencias();
        await fetchCierres();
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d.error ?? "Error al cerrar el día");
      }
    } finally {
      setCerrandoDia(false);
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

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
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
              <button className="sf-btn sf-btn-secondary" onClick={cerrarDia} disabled={!transferencias.length || cerrandoDia}>
                {cerrandoDia
                  ? <><i className="fas fa-spinner fa-spin" /> Cerrando…</>
                  : <><i className="fas fa-lock" /> Cerrar el día</>
                }
              </button>
            </div>
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
                    <th style={{ textAlign: "right" }}>Monto</th>
                    <th>Enviada</th>
                    <th>Recibida</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {transferencias.map(t => (
                    <TransferenciaRow
                      key={t.id}
                      t={t}
                      onToggle={campo => toggleFlag(t, campo, null)}
                      onDelete={() => deleteTransferencia(t.id)}
                      saving={guardandoFlagId === t.id}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Total</td>
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
                    <th style={{ textAlign: "right" }}>Enviadas</th>
                    <th style={{ textAlign: "right" }}>Recibidas</th>
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
                          <td style={{ textAlign: "right", color: c.enviadas === c.cantidad ? "var(--success-color)" : "var(--text-muted)" }}>
                            {c.enviadas} / {c.cantidad}
                          </td>
                          <td style={{ textAlign: "right", color: c.recibidas === c.cantidad ? "var(--success-color)" : "var(--warning-color)" }}>
                            {c.recibidas} / {c.cantidad}
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={6} style={{ padding: 0, background: "rgba(15,23,42,0.3)" }}>
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
                Nueva transferencia
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
  enviada: boolean;
  recibida: boolean;
}

function TransferenciaRow({ t, onToggle, onDelete, saving }: {
  t: TransferenciaFE;
  onToggle: (campo: "enviada" | "recibida") => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  return (
    <tr>
      <td>
        {t.comprobante_url ? (
          <a href={t.comprobante_url} target="_blank" rel="noopener noreferrer">
            <img src={t.comprobante_url} alt="Comprobante" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }} />
          </a>
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
        {onDelete && (
          <button className="sf-icon-btn danger" title="Eliminar" onClick={onDelete}>
            <i className="fas fa-trash" />
          </button>
        )}
      </td>
    </tr>
  );
}
