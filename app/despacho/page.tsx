"use client";

import { useState, useEffect, useCallback, useRef, FormEvent, KeyboardEvent } from "react";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import type {
  ScanOutcome, ContadoresDia, DispatchScan, EnvioTracking, HistorialFiltros, ErrorCodeScan, ResumenStockSku,
} from "@/lib/despachoDb";

const ERROR_TITULOS: Record<ErrorCodeScan, string> = {
  NOT_FOUND:             "ENVÍO NO ENCONTRADO",
  ORDER_LOOKUP_FAILED:   "NO SE PUDO RESOLVER EL PEDIDO",
  CANCELLED:             "PEDIDO CANCELADO",
  PAYMENT_NOT_CONFIRMED: "PAGO NO CONFIRMADO",
  NO_PRODUCTS:           "PEDIDO SIN PRODUCTOS",
  ALREADY_DISPATCHED:    "PEDIDO YA DESPACHADO",
};

const STATS_POLL_MS      = 12000;
const PENDIENTES_POLL_MS = 30000;
const RESULT_TIMEOUT_MS  = 6000;

function fmtHora(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// Tres sonidos bien distinguibles de oído sin mirar la pantalla (y distintos
// del de DepositoNotifier), escaneando a repetición en un depósito con
// ruido de fondo (montacargas, ventiladores, gente hablando):
// - Éxito: dos tonos ascendentes cortos y agudos (sinusoide, volumen normal).
// - Error genérico: dos tonos graves descendentes (sinusoide, volumen normal).
// - Duplicado (ya despachado): sirena de dos tonos alternados en onda
//   cuadrada, mucho más fuerte que las otras dos — la onda cuadrada tiene
//   más armónicos que una sinusoide, así que corta mejor el ruido de fondo
//   en vez de perderse entre él, y el patrón de sirena no se puede confundir
//   con el chime melódico de éxito/error.
function playTone(pares: [number, number, number][], opts?: { type?: OscillatorType; peakGain?: number }) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const type = opts?.type ?? "sine";
    const peakGain = opts?.peakGain ?? 0.35;
    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    for (const [freq, start, duration] of pares) beep(freq, start, duration);
  } catch {}
}
const playSuccessSound   = () => playTone([[880, 0, 0.11], [1320, 0.12, 0.18]], { peakGain: 1 });
const playErrorSound     = () => playTone([[220, 0, 0.16], [160, 0.17, 0.28]], { peakGain: 1 });
const playDuplicadoSound = () => playTone(
  [[900, 0, 0.1], [650, 0.18, 0.1], [900, 0.36, 0.1], [650, 0.54, 0.1]],
  { type: "square", peakGain: 1 },
);

export default function DespachoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [codigo, setCodigo]           = useState("");
  const [scanning, setScanning]       = useState(false);
  const [resultado, setResultado]     = useState<ScanOutcome | null>(null);
  const [errorRed, setErrorRed]       = useState<string | null>(null);

  const [contadores, setContadores]   = useState<ContadoresDia | null>(null);
  const [comparacion, setComparacion] = useState<{ generadas: EnvioTracking[]; pendientes: EnvioTracking[]; resumenStock: ResumenStockSku[] } | null>(null);
  const [pendientesOpen, setPendientesOpen] = useState(false);
  const [resumenOpen, setResumenOpen] = useState(false);

  const [historialOpen, setHistorialOpen]     = useState(false);
  const [historial, setHistorial]             = useState<DispatchScan[]>([]);
  const [historialFiltros, setHistorialFiltros] = useState<HistorialFiltros>({});

  const inputRef         = useRef<HTMLInputElement>(null);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enfocar = useCallback(() => inputRef.current?.focus(), []);

  // Foco permanente: al montar, y cada vez que el operario toca la pantalla
  // en cualquier lado (no debería usar mouse, pero si lo hace por error el
  // foco vuelve solo al input igual).
  useEffect(() => {
    enfocar();
    const onClick = () => enfocar();
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [enfocar]);

  const fetchContadores = useCallback(async () => {
    try {
      const res = await fetch("/api/despacho/stats");
      if (!res.ok) return;
      setContadores(await res.json());
    } catch {}
  }, []);

  const fetchComparacion = useCallback(async () => {
    try {
      const res = await fetch("/api/despacho/pendientes");
      if (!res.ok) return;
      setComparacion(await res.json());
    } catch {}
  }, []);

  const fetchHistorial = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(historialFiltros)) {
        if (v !== undefined && v !== "") params.set(k, String(v));
      }
      const res = await fetch(`/api/despacho/historial?${params.toString()}`);
      if (!res.ok) return;
      const { historial } = await res.json();
      setHistorial(historial ?? []);
    } catch {}
  }, [historialFiltros]);

  useEffect(() => {
    fetchContadores();
    fetchComparacion();
    const idStats = setInterval(fetchContadores, STATS_POLL_MS);
    const idPend  = setInterval(fetchComparacion, PENDIENTES_POLL_MS);
    return () => { clearInterval(idStats); clearInterval(idPend); };
  }, [fetchContadores, fetchComparacion]);

  useEffect(() => {
    if (historialOpen) fetchHistorial();
  }, [historialOpen, fetchHistorial]);

  useEffect(() => {
    if (!resultado) return;
    if (resultado.ok) playSuccessSound();
    else if (resultado.errorCode === "ALREADY_DISPATCHED") playDuplicadoSound();
    else playErrorSound();
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = setTimeout(() => setResultado(null), RESULT_TIMEOUT_MS);
    return () => { if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current); };
  }, [resultado]);

  // Separado de handleSubmit para poder dispararlo también desde onKeyDown
  // del input: algunos lectores USB/entornos no siempre generan un Enter que
  // el navegador interprete como submit implícito del <form>, así que esto
  // es un refuerzo — la interacción más crítica de toda la pantalla no puede
  // depender de un solo camino.
  async function enviarCodigo(valorCrudo: string) {
    const value = valorCrudo.trim();
    setCodigo("");
    enfocar();
    if (!value) return;
    setScanning(true);
    setErrorRed(null);
    try {
      const res = await fetch("/api/despacho/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorRed(body.error ?? "Error al procesar el escaneo");
        return;
      }
      const data: ScanOutcome = await res.json();
      setResultado(data);
      fetchContadores();
      fetchComparacion();
    } catch {
      setErrorRed("No se pudo conectar con el servidor");
    } finally {
      setScanning(false);
      enfocar();
    }
  }

  // El <form onSubmit> queda como respaldo (Enter en un <input> dentro de un
  // <form> sin más botones ya dispara submit por default del navegador),
  // pero onKeyDown del input es el camino principal — ver enviarCodigo.
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    enviarCodigo(codigo);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      enviarCodigo(codigo);
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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Despacho</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
            Escaneá la etiqueta de Andreani de cada paquete antes de que salga del depósito.
          </p>

          {/* ── Contadores de la jornada ── */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {[
              { label: "Despachados hoy", value: contadores?.exitosos ?? 0, icon: "fa-circle-check", color: "#22c55e" },
              { label: "Total escaneado", value: contadores?.total ?? 0, icon: "fa-barcode", color: "#3b82f6" },
              { label: "Errores", value: contadores?.errores ?? 0, icon: "fa-circle-xmark", color: "#ef4444" },
              { label: "Duplicados", value: contadores?.duplicados ?? 0, icon: "fa-clone", color: "#f59e0b" },
            ].map(k => (
              <div key={k.label} style={{ flex: "1 1 160px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", padding: "0.85rem", background: "rgba(15,23,42,0.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: k.color, marginBottom: "0.3rem" }}>
                  <i className={`fas ${k.icon}`} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>{k.label}</span>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* ── Input gigante de escaneo ── */}
          <form onSubmit={handleSubmit} style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.5rem", textAlign: "center" }}>
              ESCANEÁ EL PRÓXIMO PAQUETE
              {scanning && <i className="fas fa-spinner fa-spin" style={{ marginLeft: "0.5rem" }} />}
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
              style={{
                width: "100%", fontSize: "2rem", fontWeight: 700, textAlign: "center",
                padding: "1.25rem", letterSpacing: "0.05em",
              }}
            />
          </form>

          {errorRed && (
            <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-exclamation" style={{ flexShrink: 0 }} />
              <span>{errorRed}</span>
            </div>
          )}

          {/* ── Panel de resultado grande ── */}
          {resultado && (() => {
            // Duplicado (ya despachado) se marca aparte en naranja — no es un
            // error real del pedido como los demás (cancelado, sin pago, etc.),
            // solo un aviso de que ese paquete ya salió antes.
            const esDuplicado = !resultado.ok && resultado.errorCode === "ALREADY_DISPATCHED";
            const color = resultado.ok ? "var(--success-color)" : esDuplicado ? "#f59e0b" : "var(--error-color)";
            const bg = resultado.ok ? "rgba(16,185,129,0.12)" : esDuplicado ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
            const icon = resultado.ok ? "fa-circle-check" : esDuplicado ? "fa-clone" : "fa-circle-xmark";
            return (
            <div
              style={{
                borderRadius: "var(--radius)", padding: "1.5rem", marginBottom: "1.5rem",
                background: bg,
                border: `2px solid ${color}`,
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem",
                color,
              }}>
                <i className={`fas ${icon}`} style={{ fontSize: "1.75rem" }} />
                <span style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                  {resultado.ok ? "DESPACHO CONFIRMADO" : ERROR_TITULOS[resultado.errorCode]}
                </span>
              </div>

              {resultado.ok ? (
                <div style={{ fontSize: "1rem", lineHeight: 1.7 }}>
                  <div><strong>Pedido #{resultado.scan.numero_orden}</strong></div>
                  <div>{resultado.pedido.clienteNombre}</div>
                  {resultado.pedido.productos.map((p, i) => (
                    <div key={i}>
                      {p.nombre} × {p.cantidad}
                      {(() => {
                        const s = resultado.stock.find(s => s.sku === p.sku);
                        return s ? <span style={{ color: "var(--text-muted)" }}> — Stock disponible: {s.cantidad}</span> : null;
                      })()}
                    </div>
                  ))}
                  <div style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
                    {resultado.pedido.medioEnvio} · Tracking: {resultado.scan.tracking_number}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    {fmtHora(resultado.scan.created_at)} hs · Operario: {resultado.scan.scanned_by}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "1rem", lineHeight: 1.7 }}>
                  <div>{resultado.message}</div>
                  {resultado.pedido && <div><strong>Pedido #{resultado.pedido.numeroOrden}</strong> · {resultado.pedido.clienteNombre}</div>}
                  {resultado.primerEscaneo && (
                    <div style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
                      Primer escaneo: {fmtHora(resultado.primerEscaneo.createdAt)} hs · Operario: {resultado.primerEscaneo.scannedBy}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {/* ── Pendientes ── */}
          <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", marginBottom: "1rem" }}>
            <button
              onClick={() => setPendientesOpen(o => !o)}
              className="sf-btn sf-btn-secondary"
              style={{ width: "100%", justifyContent: "space-between", border: "none" }}
            >
              <span>
                <i className="fas fa-triangle-exclamation" style={{ marginRight: "0.5rem" }} />
                Etiquetas generadas hoy: {comparacion?.generadas.length ?? 0} · Escaneadas: {(comparacion?.generadas.length ?? 0) - (comparacion?.pendientes.length ?? 0)} · Pendientes: {comparacion?.pendientes.length ?? 0}
              </span>
              <i className={`fas fa-chevron-${pendientesOpen ? "up" : "down"}`} />
            </button>
            {pendientesOpen && (
              <div style={{ padding: "0.75rem 1rem" }}>
                {!comparacion?.generadas.length ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Todavía no se generó ninguna etiqueta hoy.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="sf-table">
                      <thead><tr><th>Pedido</th><th>Tracking</th><th>Generado</th><th>Estado</th></tr></thead>
                      <tbody>
                        {(() => {
                          const pendientesIds = new Set((comparacion.pendientes ?? []).map(p => p.id));
                          return comparacion.generadas.map(g => {
                            const pendiente = pendientesIds.has(g.id);
                            return (
                              <tr key={g.id} style={pendiente ? { background: "rgba(239,68,68,0.08)" } : undefined}>
                                <td>{g.numero_orden}</td>
                                <td>{g.tracking_number}</td>
                                <td>{fmtHora(g.created_at)}</td>
                                <td>
                                  {pendiente
                                    ? <span className="sf-badge-error"><i className="fas fa-triangle-exclamation" style={{ marginRight: "0.3rem" }} />Pendiente</span>
                                    : <span className="sf-badge-ok"><i className="fas fa-circle-check" style={{ marginRight: "0.3rem" }} />Escaneado</span>}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Resumen de stock por producto ── */}
          <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", marginBottom: "1rem" }}>
            <button
              onClick={() => setResumenOpen(o => !o)}
              className="sf-btn sf-btn-secondary"
              style={{ width: "100%", justifyContent: "space-between", border: "none" }}
            >
              <span>
                <i className="fas fa-boxes-stacked" style={{ marginRight: "0.5rem" }} />
                Resumen de stock por producto
              </span>
              <i className={`fas fa-chevron-${resumenOpen ? "up" : "down"}`} />
            </button>
            {resumenOpen && (
              <div style={{ padding: "0.75rem 1rem" }}>
                {!comparacion?.resumenStock.length ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Todavía no hay productos para resumir hoy (las etiquetas generadas antes de este cambio no tienen esta información).
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="sf-table">
                      <thead><tr><th>Producto</th><th>SKU</th><th>Escaneado</th><th>Esperado</th></tr></thead>
                      <tbody>
                        {comparacion.resumenStock.map(r => {
                          const completo = r.escaneado >= r.esperado;
                          return (
                            <tr key={r.sku} style={{ background: completo ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.08)" }}>
                              <td>{r.nombre}</td>
                              <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{r.sku}</td>
                              <td style={{ color: completo ? "var(--success-color)" : "var(--error-color)", fontWeight: 700 }}>
                                {r.escaneado}
                              </td>
                              <td>{r.esperado}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Historial ── */}
          <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)" }}>
            <button
              onClick={() => setHistorialOpen(o => !o)}
              className="sf-btn sf-btn-secondary"
              style={{ width: "100%", justifyContent: "space-between", border: "none" }}
            >
              <span><i className="fas fa-clock-rotate-left" style={{ marginRight: "0.5rem" }} /> Historial de despachos</span>
              <i className={`fas fa-chevron-${historialOpen ? "up" : "down"}`} />
            </button>
            {historialOpen && (
              <div style={{ padding: "0.75rem 1rem" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <input className="sf-input" style={{ maxWidth: 160 }} placeholder="N° de pedido"
                    value={historialFiltros.numeroOrden ?? ""} onChange={e => setHistorialFiltros(f => ({ ...f, numeroOrden: e.target.value }))} />
                  <input className="sf-input" style={{ maxWidth: 160 }} placeholder="Tracking"
                    value={historialFiltros.tracking ?? ""} onChange={e => setHistorialFiltros(f => ({ ...f, tracking: e.target.value }))} />
                  <input className="sf-input" style={{ maxWidth: 160 }} placeholder="Operario"
                    value={historialFiltros.scannedBy ?? ""} onChange={e => setHistorialFiltros(f => ({ ...f, scannedBy: e.target.value }))} />
                  <select className="sf-input" style={{ maxWidth: 150 }}
                    value={historialFiltros.status ?? ""} onChange={e => setHistorialFiltros(f => ({ ...f, status: (e.target.value || undefined) as "success" | "error" | undefined }))}>
                    <option value="">Todos los estados</option>
                    <option value="success">Éxito</option>
                    <option value="error">Error</option>
                  </select>
                  <input className="sf-input" style={{ maxWidth: 150 }} type="date"
                    value={historialFiltros.desde ?? ""} onChange={e => setHistorialFiltros(f => ({ ...f, desde: e.target.value }))} title="Desde" />
                  <input className="sf-input" style={{ maxWidth: 150 }} type="date"
                    value={historialFiltros.hasta ?? ""} onChange={e => setHistorialFiltros(f => ({ ...f, hasta: e.target.value }))} title="Hasta" />
                  <button className="sf-btn sf-btn-secondary" onClick={fetchHistorial} type="button">
                    <i className="fas fa-magnifying-glass" /> Buscar
                  </button>
                </div>

                {!historial.length ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Sin resultados.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="sf-table">
                      <thead>
                        <tr><th>Fecha</th><th>Pedido</th><th>Tracking</th><th>Cliente</th><th>Transportista</th><th>Estado</th><th>Operario</th></tr>
                      </thead>
                      <tbody>
                        {historial.map(h => (
                          <tr key={h.id}>
                            <td>{fmtHora(h.created_at)}</td>
                            <td>{h.numero_orden ?? "—"}</td>
                            <td>{h.tracking_number}</td>
                            <td>{h.cliente_nombre ?? "—"}</td>
                            <td>{h.carrier}</td>
                            <td>
                              {h.status === "success"
                                ? <span className="sf-badge-ok">Despachado</span>
                                : <span className="sf-badge-error">{h.error_code ? ERROR_TITULOS[h.error_code] : "Error"}</span>}
                            </td>
                            <td>{h.scanned_by}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>
    </div>
  );
}
