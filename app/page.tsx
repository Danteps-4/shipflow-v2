"use client";

import { useState } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";

const TOOLS = [
  {
    href: "/procesar",
    icon: "fas fa-file-excel",
    color: "#10b981",
    title: "Procesar Pedidos",
    description: "Convertí el CSV de Tienda Nube al Excel de Andreani, con validaciones, corrección de errores y separación entre envíos a domicilio y sucursal.",
    tags: ["CSV → Excel", "Validación", "Andreani"],
  },
  {
    href: "/etiquetas",
    icon: "fas fa-tags",
    color: "#a78bfa",
    title: "Agregar SKU a Etiquetas",
    description: "Tomá el PDF de etiquetas generado por Andreani y agregá automáticamente el SKU de cada pedido al pie de cada página.",
    tags: ["PDF + CSV → PDF", "SKU", "Etiquetas"],
  },
  {
    href: "/tracking",
    icon: "fas fa-truck",
    color: "#3b82f6",
    title: "Subir Tracking",
    description: "Extraé los números de seguimiento del PDF de Andreani y cargalos automáticamente en Tienda Nube con un solo click.",
    tags: ["PDF → Tienda Nube", "Seguimiento", "Automático"],
  },
  {
    href: "/orders",
    icon: "fas fa-receipt",
    color: "#f59e0b",
    title: "Ver Pedidos",
    description: "Consultá todos los pedidos de tu tienda en tiempo real con filtros por estado de pago y envío.",
    tags: ["Tienda Nube", "Tiempo real", "Filtros"],
  },
  {
    href: "/stock",
    icon: "fas fa-warehouse",
    color: "#ec4899",
    title: "Stock de Productos",
    description: "Controlá el stock de tus productos. Se descuenta automáticamente al exportar pedidos y te avisa cuando hay quiebre de stock.",
    tags: ["Stock", "Automático", "Alertas"],
  },
];

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          <a href="/" className="active"><i className="fas fa-house" /> Inicio</a>
          <a href="/orders"><i className="fas fa-receipt" /> Pedidos</a>
          <a href="/procesar"><i className="fas fa-file-excel" /> Procesar Pedidos</a>
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

          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: "3rem", paddingTop: "1rem" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: "1rem",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              marginBottom: "1.25rem",
              boxShadow: "0 0 24px rgba(99,102,241,0.35)",
            }}>
              <i className="fas fa-rocket" style={{ fontSize: "1.75rem", color: "#fff" }} />
            </div>
            <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>ShipFlow</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "1rem", maxWidth: 480, margin: "0 auto" }}>
              Herramientas para automatizar el proceso de envíos con Andreani y Tienda Nube.
            </p>
          </div>

          {/* Tool cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.25rem",
          }}>
            {TOOLS.map((tool) => (
              <a
                key={tool.href}
                href={tool.href}
                className="sf-tool-card"
                style={{ "--card-color": tool.color } as React.CSSProperties}
              >
                <div className="sf-tool-card__icon">
                  <i className={tool.icon} />
                </div>
                <div className="sf-tool-card__body">
                  <h2>{tool.title}</h2>
                  <p>{tool.description}</p>
                  <div className="sf-tool-card__tags">
                    {tool.tags.map((t) => (
                      <span key={t} className="sf-tool-card__tag">{t}</span>
                    ))}
                  </div>
                </div>
                <i className="fas fa-arrow-right sf-tool-card__arrow" />
              </a>
            ))}
          </div>

        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow · Procesamiento local · sin servidores · sin login
      </footer>
    </div>
  );
}
