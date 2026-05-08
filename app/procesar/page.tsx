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
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";

type Tab = "domicilio" | "sucursal" | "errores";

export default function ProcesarPage() {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [result, setResult]             = useState<ProcessingResult | null>(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [activeTab, setActiveTab]       = useState<Tab>("domicilio");
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<{ order: GroupedOrder; error: ValidationError } | null>(null);
  const [exportSummary, setExportSummary] = useState<{ domicilio: number; sucursal: number } | null>(null);
  const [stockInsuficiente, setStockInsuficiente] = useState<{ sku: string; nombre: string; disponible: number; solicitado: number }[]>([]);
  const [showPicker, setShowPicker]       = useState(false);
  const [tnConnected, setTnConnected]     = useState<boolean>(false);

  // Check TN connection + load orders pending from /orders page
  useEffect(() => {
    fetch("/api/auth/status").then(r => r.json()).then(d => setTnConnected(!!d.connected)).catch(() => {});

    const pending = sessionStorage.getItem("tn_pending_orders");
    if (pending) {
      sessionStorage.removeItem("tn_pending_orders");
      try {
        const tnOrders = JSON.parse(pending);
        const converted = convertTnOrders(tnOrders);
        const { domicilio, sucursal, errores } = transformOrders(converted);
        setResult({
          totalFilas: converted.length,
          ordenesUnicas: converted.length,
          domicilio, sucursal, errores, groupedOrders: converted,
        });
        if (errores.length > 0)        setActiveTab("errores");
        else if (domicilio.length > 0) setActiveTab("domicilio");
        else                           setActiveTab("sucursal");
      } catch { /* ignore malformed data */ }
    }
  }, []);

  function handleTnImport(imported: GroupedOrder[]) {
    setShowPicker(false);
    const existing = result?.groupedOrders ?? [];
    const existingNums = new Set(existing.map((o) => o.numeroOrden));
    const newOrders = imported.filter((o) => !existingNums.has(o.numeroOrden));
    const merged = [...existing, ...newOrders];
    const { domicilio, sucursal, errores } = transformOrders(merged);
    setResult({
      totalFilas: (result?.totalFilas ?? 0) + newOrders.length,
      ordenesUnicas: merged.length,
      domicilio, sucursal, errores, groupedOrders: merged,
    });
    if (errores.length > 0)        setActiveTab("errores");
    else if (domicilio.length > 0) setActiveTab("domicilio");
    else                           setActiveTab("sucursal");
  }

  function handleFile(content: string) {
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
      const { domicilio, sucursal, errores } = transformOrders(grouped);

      setResult({ totalFilas: rows.length, ordenesUnicas: grouped.length, domicilio, sucursal, errores, groupedOrders: grouped });

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

    // Descargar Excel
    await exportAndreaniWorkbook(result.domicilio, result.sucursal);
    setExportSummary({ domicilio: result.domicilio.length, sucursal: result.sucursal.length });

    // Descontar stock (best-effort: no bloqueamos si falla)
    try {
      const deduccionMap = new Map<string, { nombre: string; cantidad: number }>();
      for (const order of result.groupedOrders) {
        for (const prod of order.productos ?? []) {
          if (!prod.sku) continue;
          const prev = deduccionMap.get(prod.sku) ?? { nombre: prod.nombre, cantidad: 0 };
          prev.cantidad += prod.cantidad;
          deduccionMap.set(prod.sku, prev);
        }
      }
      if (deduccionMap.size > 0) {
        const motivo = `Exportación ${new Date().toLocaleDateString("es-AR")} (${result.domicilio.length + result.sucursal.length} pedidos)`;
        const items = Array.from(deduccionMap.entries()).map(([sku, v]) => ({ sku, nombre: v.nombre, cantidad: v.cantidad, motivo }));
        const r = await fetch("/api/stock/deducir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (r.ok) {
          const { insuficiente } = await r.json();
          setStockInsuficiente(insuficiente ?? []);
        }
      }
    } catch { /* silencioso — stock es best-effort */ }
  }

  function handleSaveOrder(updated: GroupedOrder) {
    if (!result) return;
    const newGrouped = result.groupedOrders.map((g) =>
      g.numeroOrden === updated.numeroOrden ? updated : g
    );
    const { domicilio, sucursal, errores } = transformOrders(newGrouped);
    setResult({ ...result, domicilio, sucursal, errores, groupedOrders: newGrouped });
    setEditingOrder(null);
    if (errores.length > 0) setActiveTab("errores");
    else setActiveTab(domicilio.length > 0 ? "domicilio" : "sucursal");
  }

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: "domicilio", label: "A domicilio", icon: "fas fa-house",               count: result?.domicilio.length },
    { key: "sucursal",  label: "A sucursal",  icon: "fas fa-building",            count: result?.sucursal.length  },
    { key: "errores",   label: "Errores",     icon: "fas fa-triangle-exclamation", count: result?.errores.length  },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <div className={`sf-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sf-sidebar-header">
          <h3>Menú</h3>
          <button className="sf-close-btn" onClick={() => setSidebarOpen(false)}>
            <i className="fas fa-times" />
          </button>
        </div>
        <nav className="sf-nav">
          <a href="/"><i className="fas fa-house" /> Inicio</a>
          <a href="/orders"><i className="fas fa-receipt" /> Pedidos</a>
          <a href="/procesar" className="active"><i className="fas fa-file-excel" /> Procesar Pedidos</a>
          <a href="/etiquetas"><i className="fas fa-tags" /> Agregar SKU a Etiquetas</a>
          <a href="/tracking"><i className="fas fa-truck" /> Subir Tracking</a>
          <a href="/stock"><i className="fas fa-warehouse" /> Stock de Productos</a>
        </nav>
      </div>

      <div className={`sf-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

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
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>
            Transformá el CSV de Tienda Nube al formato Andreani listo para cargar.
          </p>

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
                  const isErr = tab.key === "errores" && (tab.count ?? 0) > 0;
                  return (
                    <button
                      key={tab.key}
                      className={`sf-tab ${activeTab === tab.key ? "active" : ""}`}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      <i className={tab.icon} />
                      {tab.label}
                      {tab.count !== undefined && (
                        <span className={`sf-tab-badge ${isErr ? "error" : ""}`}>{tab.count}</span>
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
                        · {result.errores.length} pedido(s) con errores serán omitidos
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
          stockInsuficiente={stockInsuficiente}
          onClose={() => { setExportSummary(null); setStockInsuficiente([]); }}
        />
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
