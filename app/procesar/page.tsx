"use client";

import { useState, useEffect } from "react";
import FileUpload from "@/components/FileUpload";
import SummaryCards from "@/components/SummaryCards";
import PreviewTable from "@/components/PreviewTable";
import ErrorTable from "@/components/ErrorTable";
import EditOrderModal from "@/components/EditOrderModal";
import ExportSummaryModal from "@/components/ExportSummaryModal";
import TnOrderPicker from "@/components/TnOrderPicker";
import { convertTnOrders } from "@/lib/convertTnOrders";
import { parseCsv } from "@/lib/parseCsv";
import { groupOrders } from "@/lib/groupOrders";
import { transformOrders } from "@/lib/transformOrders";
import { exportAndreaniWorkbook } from "@/lib/exportAndreaniWorkbook";
import { ProcessingResult, GroupedOrder, ValidationError } from "@/types/orders";
import type { EnvioOverride } from "@/lib/pedidoEnvioDb";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";

type Tab = "domicilio" | "sucursal" | "errores" | "retiro";

interface CostoEnvio {
  id: number;
  fecha: string;
  cantidad_envios: number;
  costo_total: number;
}

function mesActualStr(): string {
  return new Date().toISOString().slice(0, 7);
}

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function fmtMesEnvio(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${NOMBRES_MES[m - 1]} ${y}`;
}

function sumarMesesEnvio(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMoneyEnvio(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n);
}

function hoyStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Trae los overrides manuales (tipo de envío, dirección o sucursal) cargados
// en /orders para estos números de pedido (silencioso ante error: si falla,
// se usa la detección automática como si no hubiera overrides).
async function fetchEnvioOverrides(numeros: string[]): Promise<Record<string, EnvioOverride>> {
  if (!numeros.length) return {};
  try {
    const res = await fetch(`/api/pedidos/envio?numeros=${numeros.join(",")}`);
    if (!res.ok) return {};
    const data = await res.json();
    return data.overrides ?? {};
  } catch {
    return {};
  }
}

// Aplica el override manual antes de que transformOrders decida en qué hoja
// entra cada pedido: fuerza el medioEnvio según el tipo, y pisa cualquier
// campo de dirección/sucursal que el usuario haya editado a mano en /orders.
function applyEnvioOverrides(orders: GroupedOrder[], overrides: Record<string, EnvioOverride>): GroupedOrder[] {
  return orders.map(o => {
    const ov = overrides[o.numeroOrden];
    if (!ov) return o;

    const next = { ...o };
    if (ov.tipo === "retiro") {
      next.retiroPresencial = true;
    } else if (ov.tipo) {
      next.medioEnvio = ov.tipo === "sucursal" ? "Punto de retiro" : "Andreani a Domicilio";
      next.retiroPresencial = false;
      if (ov.tipo === "domicilio") next.sucursal = "";
    }
    if (ov.direccion != null)       next.direccion = ov.direccion;
    if (ov.numeroDireccion != null) next.numeroDireccion = ov.numeroDireccion;
    if (ov.piso != null)            next.piso = ov.piso;
    if (ov.localidad != null)       next.localidad = ov.localidad;
    if (ov.provincia != null)       next.provincia = ov.provincia;
    if (ov.codigoPostal != null)    next.codigoPostal = ov.codigoPostal;
    if (ov.sucursal != null)        next.sucursal = ov.sucursal;
    return next;
  });
}

export default function ProcesarPage() {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [result, setResult]             = useState<ProcessingResult | null>(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [activeTab, setActiveTab]       = useState<Tab>("domicilio");
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<{ order: GroupedOrder; error: ValidationError } | null>(null);
  const [exportSummary, setExportSummary] = useState<{ domicilio: number; sucursal: number } | null>(null);
  const [showPicker, setShowPicker]       = useState(false);
  const [tnConnected, setTnConnected]     = useState<boolean>(false);

  // Envío promedio: estadística de referencia (no un gasto) para ajustar
  // el cálculo de profit en otro software. Se carga aparte de la
  // exportación, porque al descargar el Excel todavía no se sabe el costo.
  const [costosEnvio, setCostosEnvio] = useState<CostoEnvio[]>([]);
  const [mesEnvio, setMesEnvio]       = useState(mesActualStr());
  const [costoModal, setCostoModal]   = useState<{ id: number | null; fecha: string; cantidadEnvios: string; costoTotal: string } | null>(null);
  const [guardandoCosto, setGuardandoCosto] = useState(false);
  const [borrandoCostoId, setBorrandoCostoId] = useState<number | null>(null);
  const [verMovimientosCosto, setVerMovimientosCosto] = useState(false);

  async function fetchCostosEnvio() {
    try {
      const res = await fetch("/api/costos-envio");
      if (res.ok) setCostosEnvio((await res.json()).costos ?? []);
    } catch { /* silencioso: es solo una estadística de referencia */ }
  }

  async function guardarCostoEnvio() {
    if (!costoModal) return;
    const cantidadEnvios = Number(costoModal.cantidadEnvios);
    const costoTotal = Number(costoModal.costoTotal);
    if (!Number.isFinite(cantidadEnvios) || cantidadEnvios <= 0) return alert("Ingresá la cantidad de envíos.");
    if (!Number.isFinite(costoTotal) || costoTotal <= 0) return alert("Ingresá el costo total.");
    setGuardandoCosto(true);
    try {
      await fetch("/api/costos-envio", {
        method: costoModal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: costoModal.id, costoTotal, cantidadEnvios, fecha: costoModal.fecha }),
      });
      setCostoModal(null);
      await fetchCostosEnvio();
    } finally {
      setGuardandoCosto(false);
    }
  }

  async function borrarCostoEnvio(id: number) {
    if (!confirm("¿Eliminar este registro de costo de envío?")) return;
    setBorrandoCostoId(id);
    try {
      await fetch("/api/costos-envio", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await fetchCostosEnvio();
    } finally {
      setBorrandoCostoId(null);
    }
  }

  // Check TN connection + load orders pending from /orders page
  useEffect(() => {
    fetch("/api/auth/status").then(r => r.json()).then(d => setTnConnected(!!d.connected)).catch(() => {});
    fetchCostosEnvio();

    const pending = sessionStorage.getItem("tn_pending_orders");
    if (pending) {
      sessionStorage.removeItem("tn_pending_orders");
      try {
        const tnOrders = JSON.parse(pending);
        const converted = convertTnOrders(tnOrders);
        fetchEnvioOverrides(converted.map(o => o.numeroOrden)).then(overrides => {
          const withOverrides = applyEnvioOverrides(converted, overrides);
          const { domicilio, sucursal, errores, retiroPresencial } = transformOrders(withOverrides);
          setResult({
            totalFilas: withOverrides.length,
            ordenesUnicas: withOverrides.length,
            domicilio, sucursal, errores, retiroPresencial, groupedOrders: withOverrides,
          });
          if (errores.length > 0)        setActiveTab("errores");
          else if (domicilio.length > 0) setActiveTab("domicilio");
          else                           setActiveTab("sucursal");
        });
      } catch { /* ignore malformed data */ }
    }
  }, []);

  async function handleTnImport(imported: GroupedOrder[]) {
    setShowPicker(false);
    const existing = result?.groupedOrders ?? [];
    const existingNums = new Set(existing.map((o) => o.numeroOrden));
    const newOrders = imported.filter((o) => !existingNums.has(o.numeroOrden));
    const overrides = await fetchEnvioOverrides(newOrders.map(o => o.numeroOrden));
    const merged = [...existing, ...applyEnvioOverrides(newOrders, overrides)];
    const { domicilio, sucursal, errores, retiroPresencial } = transformOrders(merged);
    setResult({
      totalFilas: (result?.totalFilas ?? 0) + newOrders.length,
      ordenesUnicas: merged.length,
      domicilio, sucursal, errores, retiroPresencial, groupedOrders: merged,
    });
    if (errores.length > 0)        setActiveTab("errores");
    else if (domicilio.length > 0) setActiveTab("domicilio");
    else                           setActiveTab("sucursal");
  }

  async function handleFile(content: string) {
    setIsLoading(true);
    setParseWarning(null);
    try {
      const { rows, columnMap } = parseCsv(content);

      const missingCols: string[] = [];
      if (!columnMap.numeroOrden) missingCols.push("Número de orden");
      if (!columnMap.nombreEnvio) missingCols.push("Nombre para el envío");
      if (!columnMap.medioEnvio)  missingCols.push("Medio de envío");
      if (!columnMap.telefonoEnvio && !columnMap.telefonoComprador) missingCols.push("Teléfono");
      if (missingCols.length > 0) {
        setParseWarning(`Columnas no detectadas: ${missingCols.join(", ")}. Verificá que el CSV sea de Tienda Nube.`);
      }

      const grouped = groupOrders(rows, columnMap);
      const overrides = await fetchEnvioOverrides(grouped.map(o => o.numeroOrden));
      const withOverrides = applyEnvioOverrides(grouped, overrides);
      const { domicilio, sucursal, errores, retiroPresencial } = transformOrders(withOverrides);

      setResult({ totalFilas: rows.length, ordenesUnicas: withOverrides.length, domicilio, sucursal, errores, retiroPresencial, groupedOrders: withOverrides });

      if (errores.length > 0)        setActiveTab("errores");
      else if (domicilio.length > 0) setActiveTab("domicilio");
      else                           setActiveTab("sucursal");
    } catch (err) {
      console.error(err);
      setParseWarning("Error al procesar el archivo. Verificá que sea un CSV válido de Tienda Nube.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExport() {
    if (!result) return;
    const snap = result;
    await exportAndreaniWorkbook(snap.domicilio, snap.sucursal);
    setExportSummary({ domicilio: snap.domicilio.length, sucursal: snap.sucursal.length });
  }

  function handleSaveOrder(updated: GroupedOrder) {
    if (!result) return;
    const newGrouped = result.groupedOrders.map((g) =>
      g.numeroOrden === updated.numeroOrden ? updated : g
    );
    const { domicilio, sucursal, errores, retiroPresencial } = transformOrders(newGrouped);
    setResult({ ...result, domicilio, sucursal, errores, retiroPresencial, groupedOrders: newGrouped });
    setEditingOrder(null);
    if (updated.retiroPresencial) {
      setActiveTab("retiro");
    } else if (errores.length > 0) {
      setActiveTab("errores");
    } else {
      setActiveTab(domicilio.length > 0 ? "domicilio" : "sucursal");
    }
  }

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: "domicilio", label: "A domicilio",       icon: "fas fa-house",                count: result?.domicilio.length         },
    { key: "sucursal",  label: "A sucursal",         icon: "fas fa-building",             count: result?.sucursal.length          },
    { key: "errores",   label: "Errores",            icon: "fas fa-triangle-exclamation", count: result?.errores.length           },
    { key: "retiro",    label: "Retiro presencial",  icon: "fas fa-store",                count: result?.retiroPresencial.length  },
  ];

  const costosDelMes  = costosEnvio.filter(c => c.fecha.slice(0, 7) === mesEnvio);
  const totalCostoMes = costosDelMes.reduce((s, c) => s + Number(c.costo_total), 0);
  const totalEnviosMes = costosDelMes.reduce((s, c) => s + Number(c.cantidad_envios), 0);
  const envioPromedio  = totalEnviosMes > 0 ? totalCostoMes / totalEnviosMes : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}><StoreSwitcher /><UserMenu /></div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────── */}
      <main className="sf-main">
        <div className="sf-container">

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Procesar Pedidos
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Transformá el CSV de Tienda Nube al formato Andreani listo para cargar.
          </p>

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem",
            padding: "0.9rem 1.1rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
            background: "rgba(15,23,42,0.4)", marginBottom: "2rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <i className="fas fa-chart-line" style={{ color: "var(--primary-color)" }} />
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Envío promedio · {fmtMesEnvio(mesEnvio)}
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {envioPromedio != null ? fmtMoneyEnvio(envioPromedio) : "Sin datos"}
                  {totalEnviosMes > 0 && (
                    <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                      ({totalEnviosMes} envío{totalEnviosMes !== 1 ? "s" : ""})
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <button className="sf-icon-btn" title="Mes anterior" onClick={() => setMesEnvio(m => sumarMesesEnvio(m, -1))}>
                <i className="fas fa-chevron-left" />
              </button>
              {mesEnvio !== mesActualStr() && (
                <button
                  className="sf-btn sf-btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                  onClick={() => setMesEnvio(mesActualStr())}
                >
                  Hoy
                </button>
              )}
              <button className="sf-icon-btn" title="Mes siguiente" onClick={() => setMesEnvio(m => sumarMesesEnvio(m, 1))}>
                <i className="fas fa-chevron-right" />
              </button>
              {totalEnviosMes > 0 && (
                <button
                  className="sf-btn sf-btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", marginLeft: "0.4rem" }}
                  onClick={() => setVerMovimientosCosto(v => !v)}
                >
                  <i className={`fas fa-chevron-${verMovimientosCosto ? "up" : "down"}`} /> Ver movimientos
                </button>
              )}
              <button
                className="sf-btn sf-btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", marginLeft: "0.4rem" }}
                onClick={() => setCostoModal({ id: null, fecha: hoyStr(), cantidadEnvios: "", costoTotal: "" })}
              >
                <i className="fas fa-plus" /> Agregar costo
              </button>
            </div>
          </div>

          {verMovimientosCosto && costosDelMes.length > 0 && (
            <div style={{
              border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
              marginTop: "-1.25rem", marginBottom: "2rem", overflow: "hidden",
            }}>
              <table className="sf-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Envíos</th>
                    <th>Costo total</th>
                    <th style={{ width: "1px" }} />
                  </tr>
                </thead>
                <tbody>
                  {costosDelMes.map((c, i) => (
                    <tr key={i} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                      <td>{c.fecha.slice(0, 10)}</td>
                      <td>{c.cantidad_envios}</td>
                      <td>{fmtMoneyEnvio(Number(c.costo_total))}</td>
                      <td style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          title="Editar"
                          onClick={() => setCostoModal({
                            id: c.id, fecha: c.fecha.slice(0, 10),
                            cantidadEnvios: String(c.cantidad_envios), costoTotal: String(c.costo_total),
                          })}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 4px" }}
                        >
                          <i className="fas fa-pen" />
                        </button>
                        <button
                          title="Eliminar"
                          disabled={borrandoCostoId === c.id}
                          onClick={() => borrarCostoEnvio(c.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error-color)", padding: "2px 4px" }}
                        >
                          <i className={`fas ${borrandoCostoId === c.id ? "fa-spinner fa-spin" : "fa-trash"}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="sf-section-title">
            <div className={`sf-step-badge ${result ? "" : "pending"}`}>
              {result ? <i className="fas fa-check" style={{ fontSize: "0.65rem" }} /> : "1"}
            </div>
            <div>
              <h2>Subir archivo CSV</h2>
              <p>Exportación de órdenes desde Tienda Nube</p>
            </div>
          </div>

          <FileUpload onFile={handleFile} isLoading={isLoading} />

          {tnConnected && (
            <div style={{ marginTop: "1rem" }}>
              <button className="sf-btn sf-btn-secondary" onClick={() => setShowPicker(true)}>
                <i className="fas fa-store" /> Importar desde Tienda Nube
              </button>
            </div>
          )}

          {parseWarning && (
            <div className="sf-alert sf-alert-warning" style={{ marginTop: "1rem" }}>
              <i className="fas fa-triangle-exclamation" style={{ marginTop: "2px", flexShrink: 0 }} />
              <span>{parseWarning}</span>
            </div>
          )}

          {result && (
            <>
              <hr className="sf-divider" />

              <div className="sf-section-title">
                <div className="sf-step-badge">
                  <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                </div>
                <div>
                  <h2>Resumen del procesamiento</h2>
                  <p>{result.ordenesUnicas} órdenes únicas · {result.totalFilas} filas leídas</p>
                </div>
              </div>

              <SummaryCards
                totalFilas={result.totalFilas}
                ordenesUnicas={result.ordenesUnicas}
                totalDomicilio={result.domicilio.length}
                totalSucursal={result.sucursal.length}
                totalErrores={result.errores.length}
              />

              <hr className="sf-divider" />

              <div className="sf-section-title">
                <div className="sf-step-badge">
                  <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                </div>
                <div>
                  <h2>Vista previa</h2>
                  <p>Revisá los datos antes de exportar</p>
                </div>
              </div>

              <div className="sf-tabs">
                {tabs.map((tab) => {
                  const isErr    = tab.key === "errores" && (tab.count ?? 0) > 0;
                  const isRetiro = tab.key === "retiro"  && (tab.count ?? 0) > 0;
                  return (
                    <button
                      key={tab.key}
                      className={`sf-tab ${activeTab === tab.key ? "active" : ""}`}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      <i className={tab.icon} />
                      {tab.label}
                      {tab.count !== undefined && (
                        <span
                          className={`sf-tab-badge ${isErr ? "error" : ""}`}
                          style={isRetiro ? { background: "rgba(99,102,241,0.18)", color: "var(--primary-color)" } : {}}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {activeTab === "domicilio" && (
                <PreviewTable
                  data={result.domicilio}
                  errores={result.errores}
                  tipo="domicilio"
                  groupedOrders={result.groupedOrders}
                  onEdit={(order, error) => setEditingOrder({ order, error })}
                />
              )}
              {activeTab === "sucursal" && (
                <PreviewTable
                  data={result.sucursal}
                  errores={result.errores}
                  tipo="sucursal"
                  groupedOrders={result.groupedOrders}
                  onEdit={(order, error) => setEditingOrder({ order, error })}
                />
              )}
              {activeTab === "errores" && (
                <ErrorTable
                  errores={result.errores}
                  groupedOrders={result.groupedOrders}
                  onEdit={(order, error) => setEditingOrder({ order, error })}
                />
              )}
              {activeTab === "retiro" && (
                result.retiroPresencial.length === 0 ? (
                  <div className="sf-empty">
                    <i className="fas fa-store sf-empty-icon" />
                    <p style={{ fontWeight: 600, color: "var(--text-muted)" }}>No hay pedidos de retiro presencial</p>
                  </div>
                ) : (
                  <div className="sf-table-wrap">
                    <table className="sf-table">
                      <thead>
                        <tr>
                          <th>Orden</th>
                          <th>Cliente</th>
                          <th>Tipo de envío</th>
                          <th style={{ width: "1px" }} />
                        </tr>
                      </thead>
                      <tbody>
                        {result.retiroPresencial.map((order, i) => (
                          <tr key={order.numeroOrden} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                            <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{order.numeroOrden}</td>
                            <td>{order.nombreEnvio || "—"}</td>
                            <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{order.medioEnvio || "—"}</td>
                            <td>
                              <button
                                onClick={() => setEditingOrder({
                                  order,
                                  error: { numeroOrden: order.numeroOrden, campos: [], tipo: order.medioEnvio.trim().toLowerCase() === "punto de retiro" ? "sucursal" : "domicilio" },
                                })}
                                title="Editar pedido"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 4px", borderRadius: "4px", lineHeight: 1, fontSize: "0.8rem", transition: "color 0.15s" }}
                                onMouseEnter={e => (e.currentTarget.style.color = "var(--accent-color)")}
                                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                              >
                                <i className="fas fa-pen" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              <hr className="sf-divider" />

              <div className="sf-section-title">
                <div className="sf-step-badge">
                  <i className="fas fa-check" style={{ fontSize: "0.65rem" }} />
                </div>
                <div>
                  <h2>Descargar archivo</h2>
                  <p>
                    Excel con hojas &quot;A domicilio&quot; y &quot;A sucursal&quot;
                    {result.errores.length > 0 && (
                      <span style={{ color: "var(--error-color)", marginLeft: "0.4rem" }}>
                        · {result.errores.length} pedido(s) con errores omitidos
                      </span>
                    )}
                    {result.retiroPresencial.length > 0 && (
                      <span style={{ color: "var(--text-muted)", marginLeft: "0.4rem" }}>
                        · {result.retiroPresencial.length} retiro{result.retiroPresencial.length !== 1 ? "s" : ""} presencial{result.retiroPresencial.length !== 1 ? "es" : ""} excluidos
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="sf-export-bar">
                <div className="sf-export-stats">
                  <div className="sf-export-stat">
                    <span className="sf-dot" style={{ backgroundColor: "var(--success-color)" }} />
                    {result.domicilio.length} a domicilio
                  </div>
                  <div className="sf-export-stat">
                    <span className="sf-dot" style={{ backgroundColor: "#a78bfa" }} />
                    {result.sucursal.length} a sucursal
                  </div>
                  {result.errores.length > 0 && (
                    <div className="sf-export-stat">
                      <span className="sf-dot" style={{ backgroundColor: "var(--error-color)" }} />
                      {result.errores.length} omitidos
                    </div>
                  )}
                  {result.retiroPresencial.length > 0 && (
                    <div className="sf-export-stat">
                      <span className="sf-dot" style={{ backgroundColor: "var(--primary-color)" }} />
                      {result.retiroPresencial.length} retiro{result.retiroPresencial.length !== 1 ? "s" : ""} presencial{result.retiroPresencial.length !== 1 ? "es" : ""}
                    </div>
                  )}
                </div>
                <button className="sf-btn" onClick={handleExport}>
                  <i className="fas fa-download" /> Descargar Excel
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {showPicker && (
        <TnOrderPicker onImport={handleTnImport} onClose={() => setShowPicker(false)} />
      )}

      {exportSummary && result && (
        <ExportSummaryModal
          exportedDomicilio={exportSummary.domicilio}
          exportedSucursal={exportSummary.sucursal}
          omitidos={result.errores}
          onClose={() => setExportSummary(null)}
        />
      )}

      {costoModal && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !guardandoCosto && setCostoModal(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(420px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-coins" style={{ color: "var(--primary-color)" }} />
                {costoModal.id ? "Editar costo de envío" : "Agregar costo de envío"}
              </h3>
              <button className="sf-close-btn" onClick={() => !guardandoCosto && setCostoModal(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label className="sf-label">
                Fecha
                <input
                  className="sf-input" type="date" value={costoModal.fecha}
                  onChange={e => setCostoModal(m => m && ({ ...m, fecha: e.target.value }))}
                />
              </label>
              <label className="sf-label">
                Cantidad de envíos
                <input
                  className="sf-input" type="number" min="1" step="1"
                  value={costoModal.cantidadEnvios}
                  onChange={e => setCostoModal(m => m && ({ ...m, cantidadEnvios: e.target.value }))}
                  placeholder="Ej: 10"
                />
              </label>
              <label className="sf-label">
                Costo total
                <input
                  className="sf-input" type="number" min="0" step="0.01"
                  value={costoModal.costoTotal}
                  onChange={e => setCostoModal(m => m && ({ ...m, costoTotal: e.target.value }))}
                  placeholder="0.00"
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  Solo para calcular el envío promedio del mes — no se agrega como gasto.
                </span>
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setCostoModal(null)} disabled={guardandoCosto}>Cancelar</button>
              <button className="sf-btn" onClick={guardarCostoEnvio} disabled={guardandoCosto}>
                {guardandoCosto ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder.order}
          error={editingOrder.error}
          onSave={handleSaveOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>
    </div>
  );
}
