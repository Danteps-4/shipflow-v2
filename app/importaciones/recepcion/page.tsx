"use client";

import { useState, useEffect, useCallback, useRef, FormEvent, KeyboardEvent } from "react";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

interface LineaCompra {
  id: number;
  sku: string;
  nombre: string;
  cantidad_esperada: number;
  cantidad_recibida: number;
  unidades_por_caja: number | null;
}

interface Compra {
  id: number;
  tracking_number: string;
  fecha_compra: string;
}

interface Desglose {
  compra: Compra;
  lineas: LineaCompra[];
}

interface ConfirmarResult {
  escaneo: { id: number; sku: string; cantidad: number; created_at: string };
  linea: LineaCompra;
  compraCompleta: boolean;
}

interface Contadores {
  cajas: number;
  unidades: number;
  ultimoEscaneo: { sku: string; cantidad: number; created_at: string } | null;
}

const STATS_POLL_MS = 15000;
const RESULT_TIMEOUT_MS = 7000;

function fmtHora(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Mismo patrón de sonido que app/despacho/page.tsx — dos tonos cortos.
function playTone(pares: [number, number, number][]) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    for (const [freq, start, duration] of pares) beep(freq, start, duration);
  } catch {}
}
const playSuccessSound = () => playTone([[880, 0, 0.11], [1320, 0.12, 0.18]]);
const playErrorSound   = () => playTone([[220, 0, 0.16], [160, 0.17, 0.28]]);

export default function RecepcionPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [resolviendo, setResolviendo] = useState(false);
  const [desglose, setDesglose] = useState<Desglose | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [lineaSeleccionada, setLineaSeleccionada] = useState<number | null>(null);
  const [cantidadCaja, setCantidadCaja] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmarResult | null>(null);

  const [contadores, setContadores] = useState<Contadores | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enfocar = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    enfocar();
    const onClick = () => { if (!desglose) enfocar(); };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [enfocar, desglose]);

  const fetchContadores = useCallback(async () => {
    try {
      const res = await fetch("/api/importaciones/recepcion/stats");
      if (!res.ok) return;
      setContadores(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchContadores();
    const id = setInterval(fetchContadores, STATS_POLL_MS);
    return () => clearInterval(id);
  }, [fetchContadores]);

  useEffect(() => {
    if (!confirmResult) return;
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = setTimeout(() => setConfirmResult(null), RESULT_TIMEOUT_MS);
    return () => { if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current); };
  }, [confirmResult]);

  async function resolverCodigo(valorCrudo: string) {
    const value = valorCrudo.trim();
    setCodigo("");
    if (!value) { enfocar(); return; }
    setResolviendo(true);
    setErrorMsg(null);
    setConfirmResult(null);
    try {
      const res = await fetch("/api/importaciones/recepcion/resolver", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        playErrorSound();
        setErrorMsg(data.error ?? "No se pudo resolver el código");
        setDesglose(null);
        return;
      }
      setDesglose(data);
      setLineaSeleccionada(null);
      setCantidadCaja("");
    } catch {
      playErrorSound();
      setErrorMsg("No se pudo conectar con el servidor");
    } finally {
      setResolviendo(false);
      enfocar();
    }
  }

  function handleSubmit(e: FormEvent) { e.preventDefault(); resolverCodigo(codigo); }
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); resolverCodigo(codigo); }
  }

  function elegirLinea(linea: LineaCompra) {
    setLineaSeleccionada(linea.id);
    const pendiente = Math.max(0, linea.cantidad_esperada - linea.cantidad_recibida);
    setCantidadCaja(String(linea.unidades_por_caja ?? pendiente ?? ""));
  }

  async function handleConfirmarCaja() {
    if (!desglose || !lineaSeleccionada || !cantidadCaja || Number(cantidadCaja) <= 0) return;
    setConfirmando(true);
    try {
      const res = await fetch("/api/importaciones/recepcion/confirmar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compraId: desglose.compra.id, lineaId: lineaSeleccionada,
          cantidad: Number(cantidadCaja), codigo: desglose.compra.tracking_number,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        playErrorSound();
        setErrorMsg(data.error ?? "Error al confirmar la caja");
        return;
      }
      playSuccessSound();
      setConfirmResult(data);
      fetchContadores();
      // Vuelve a dejar la pantalla lista para la próxima caja/escaneo.
      setDesglose(null);
      setLineaSeleccionada(null);
      setCantidadCaja("");
    } catch {
      playErrorSound();
      setErrorMsg("No se pudo conectar con el servidor");
    } finally {
      setConfirmando(false);
      enfocar();
    }
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
          <UserMenu />
        </div>
      </header>

      <main className="sf-main">
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Recepción</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
            Escaneá el tracking de la compra por cada caja física que llegue — el mismo código puede escanearse varias veces (una por caja).
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {[
              { label: "Cajas hoy", value: contadores?.cajas ?? 0, icon: "fa-box", color: "#22c55e" },
              { label: "Unidades hoy", value: contadores?.unidades ?? 0, icon: "fa-layer-group", color: "#3b82f6" },
            ].map(k => (
              <div key={k.label} style={{ flex: "1 1 160px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.85rem", background: "rgba(15,23,42,0.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: k.color, marginBottom: "0.3rem" }}>
                  <i className={`fas ${k.icon}`} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>{k.label}</span>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{k.value}</div>
              </div>
            ))}
            {contadores?.ultimoEscaneo && (
              <div style={{ flex: "2 1 260px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.85rem", background: "rgba(15,23,42,0.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                  <i className="fas fa-clock-rotate-left" />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>Último escaneo</span>
                </div>
                <div style={{ fontSize: "0.9rem" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{contadores.ultimoEscaneo.sku}</span>
                  {" "}× {contadores.ultimoEscaneo.cantidad} — {fmtHora(contadores.ultimoEscaneo.created_at)} hs
                </div>
              </div>
            )}
          </div>

          {!desglose && (
            <form onSubmit={handleSubmit} style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.5rem", textAlign: "center" }}>
                ESCANEÁ EL TRACKING DE LA CAJA
                {resolviendo && <i className="fas fa-spinner fa-spin" style={{ marginLeft: "0.5rem" }} />}
              </label>
              <input
                ref={inputRef}
                type="text"
                autoFocus
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={enfocar}
                className="sf-input"
                placeholder="Esperando escaneo..."
                style={{ width: "100%", fontSize: "2rem", fontWeight: 700, textAlign: "center", padding: "1.25rem", letterSpacing: "0.05em" }}
              />
            </form>
          )}

          {errorMsg && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
              <button className="sf-btn sf-btn-secondary" style={{ marginLeft: "auto" }} onClick={() => { setErrorMsg(null); enfocar(); }}>Escanear de nuevo</button>
            </div>
          )}

          {confirmResult && (
            <div style={{
              borderRadius: "var(--radius)", padding: "1.5rem", marginBottom: "1.5rem",
              background: "rgba(16,185,129,0.12)", border: "2px solid var(--success-color)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem", color: "var(--success-color)" }}>
                <i className="fas fa-circle-check" style={{ fontSize: "1.75rem" }} />
                <span style={{ fontSize: "1.5rem", fontWeight: 800 }}>CAJA CONFIRMADA</span>
              </div>
              <div style={{ fontSize: "1rem", lineHeight: 1.7 }}>
                <div><strong>{confirmResult.linea.sku}</strong> — {confirmResult.linea.nombre} × {confirmResult.escaneo.cantidad}</div>
                <div style={{ color: "var(--text-muted)" }}>
                  Recibido de esta línea: {confirmResult.linea.cantidad_recibida} / {confirmResult.linea.cantidad_esperada}
                </div>
                {confirmResult.compraCompleta && (
                  <div style={{ color: "var(--success-color)", fontWeight: 700, marginTop: "0.4rem" }}>
                    <i className="fas fa-check-double" /> Esta compra ya quedó completa
                  </div>
                )}
              </div>
            </div>
          )}

          {desglose && (
            <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "1.25rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Tracking</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.1rem" }}>{desglose.compra.tracking_number}</div>
                </div>
                <button className="sf-btn sf-btn-secondary" onClick={() => { setDesglose(null); setLineaSeleccionada(null); enfocar(); }}>
                  <i className="fas fa-xmark" /> Cancelar
                </button>
              </div>

              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>¿Qué producto es esta caja?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
                {desglose.lineas.map(linea => {
                  const completa = linea.cantidad_recibida >= linea.cantidad_esperada;
                  const seleccionada = lineaSeleccionada === linea.id;
                  return (
                    <button
                      key={linea.id}
                      onClick={() => elegirLinea(linea)}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.75rem", textAlign: "left",
                        padding: "0.75rem 1rem", borderRadius: "var(--radius)", cursor: "pointer",
                        border: seleccionada ? "2px solid var(--primary-color)" : "1px solid var(--border-color)",
                        background: seleccionada ? "rgba(59,130,246,0.1)" : "transparent",
                      }}
                    >
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{linea.sku}</span>
                      <span style={{ color: "var(--text-muted)", flex: 1 }}>{linea.nombre}</span>
                      <span style={{ fontWeight: 700, color: completa ? "var(--success-color)" : "#f59e0b" }}>
                        {linea.cantidad_recibida} / {linea.cantidad_esperada}
                      </span>
                    </button>
                  );
                })}
              </div>

              {lineaSeleccionada && (
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Unidades en esta caja</label>
                    <input type="number" className="sf-input" style={{ width: 140, fontSize: "1.2rem" }} value={cantidadCaja}
                      onChange={e => setCantidadCaja(e.target.value)} autoFocus />
                  </div>
                  <button className="sf-btn" onClick={handleConfirmarCaja} disabled={confirmando || !cantidadCaja || Number(cantidadCaja) <= 0}>
                    {confirmando ? <><i className="fas fa-spinner fa-spin" /> Confirmando...</> : <><i className="fas fa-check" /> Confirmar caja</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>
    </div>
  );
}
