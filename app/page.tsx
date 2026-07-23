"use client";

import { useState, useEffect } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import { ModuleKey } from "@/lib/modules";
import { hasLinkAccess } from "@/lib/navGroups";

const TOOL_GROUPS = [
  {
    label: "Pedidos",
    module: "pedidos" as ModuleKey,
    tools: [
      {
        href: "/orders",
        icon: "fas fa-receipt",
        color: "#f59e0b",
        title: "Ver Pedidos",
        description: "Consultá todos los pedidos de tu tienda en tiempo real con filtros por estado de pago y envío.",
        tags: ["Tienda Nube", "Tiempo real", "Filtros"],
      },
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
    ],
  },
  {
    label: "Mercado Libre",
    module: "mercadolibre" as ModuleKey,
    tools: [
      {
        href: "/mercadolibre",
        icon: "fas fa-plug",
        color: "#fff159",
        title: "Conectar Mercado Libre",
        description: "Vinculá tu cuenta de vendedor para que cada venta paga descuente stock automáticamente, en tiempo real, junto con Tienda Nube.",
        tags: ["OAuth", "Webhooks", "Stock en tiempo real"],
      },
      {
        href: "/mercadolibre/pedidos",
        icon: "fas fa-receipt",
        color: "#fff159",
        title: "Pedidos de Mercado Libre",
        description: "Consultá en tiempo real las ventas de tu cuenta de Mercado Libre: comprador, productos, total y estado de cada pedido.",
        tags: ["Tiempo real", "Filtros", "Mercado Libre"],
      },
      {
        href: "/etiquetas-ml",
        icon: "fas fa-barcode",
        color: "#fff159",
        title: "Etiquetas ML (ZPL → PDF)",
        description: "Convertí el ZIP o TXT de etiquetas ZPL de Mercado Libre a un PDF listo para imprimir en tu impresora térmica, con el SKU incluido.",
        tags: ["ZPL → PDF", "Térmica", "SKU"],
      },
    ],
  },
  {
    label: "Stock",
    module: "stock" as ModuleKey,
    tools: [
      {
        href: "/stock",
        icon: "fas fa-warehouse",
        color: "#ec4899",
        title: "Stock de Productos",
        description: "Controlá el stock de tus productos. Se descuenta automáticamente al exportar pedidos y te avisa cuando hay quiebre de stock.",
        tags: ["Stock", "Automático", "Alertas"],
      },
    ],
  },
  {
    label: "Finanzas",
    module: "finanzas" as ModuleKey,
    tools: [
      {
        href: "/finanzas",
        icon: "fas fa-chart-pie",
        color: "#10b981",
        title: "Gastos y Suscripciones",
        description: "Registrá gastos puntuales y suscripciones recurrentes para tener un panorama claro de los costos mensuales de tu negocio.",
        tags: ["Gastos", "Suscripciones", "Costos"],
      },
      {
        href: "/finanzas/transferencias",
        icon: "fas fa-money-bill-transfer",
        color: "#3b82f6",
        title: "Transferencias",
        description: "Cargá las transferencias desviadas a la financiera, marcá enviada/recibida y cerrá el día para llevar un historial claro.",
        tags: ["Transferencias", "Comprobantes", "Cierre diario"],
      },
    ],
  },
  {
    label: "Creativo",
    module: "creativo" as ModuleKey,
    tools: [
      {
        href: "/creativo",
        icon: "fas fa-clapperboard",
        color: "#ec4899",
        title: "Ángulos, guiones y formatos",
        description: "Biblioteca de ángulos, guiones ganadores y formatos que ya funcionaron, con sus imágenes y videos de referencia.",
        tags: ["Ángulos", "Guiones", "Formatos"],
      },
    ],
  },
  {
    label: "Soporte",
    module: "soporte" as ModuleKey,
    tools: [
      {
        href: "/soporte",
        icon: "fas fa-headset",
        color: "#3b82f6",
        title: "Tickets de Soporte",
        description: "Cargá los problemas de los clientes en un tablero tipo Trello: Pendiente, En proceso y Resuelto.",
        tags: ["Atención al cliente", "Tickets", "Tablero"],
      },
    ],
  },
];

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole]               = useState<"admin" | "member" | null>(null);
  const [modules, setModules]         = useState<ModuleKey[]>([]);
  const [linkAccess, setLinkAccess]   = useState<string[] | undefined>(undefined);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => {
        setRole(d.user?.role ?? null);
        setModules(d.user?.modules ?? []);
        setLinkAccess(d.user?.linkAccess);
      })
      .catch(() => {});
  }, []);

  const isAdmin = role === "admin";
  const visibleGroups = TOOL_GROUPS
    .filter((g) => isAdmin || modules.includes(g.module))
    .map((g) => ({ ...g, tools: g.tools.filter((t) => isAdmin || hasLinkAccess(linkAccess, t.href)) }))
    .filter((g) => g.tools.length > 0);

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

          {/* Tool cards, agrupadas por área de negocio */}
          {visibleGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: "2.5rem" }}>
              <h2 style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "1rem",
              }}>
                {group.label}
              </h2>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
              }}>
                {group.tools.map((tool) => (
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
          ))}

          {isAdmin && (
            <div style={{ marginBottom: "2.5rem" }}>
              <h2 style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "1rem",
              }}>
                Administración
              </h2>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
              }}>
                <a
                  href="/equipo"
                  className="sf-tool-card"
                  style={{ "--card-color": "#64748b" } as React.CSSProperties}
                >
                  <div className="sf-tool-card__icon">
                    <i className="fas fa-users-gear" />
                  </div>
                  <div className="sf-tool-card__body">
                    <h2>Equipo</h2>
                    <p>Gestioná qué módulos puede ver cada persona del equipo.</p>
                    <div className="sf-tool-card__tags">
                      <span className="sf-tool-card__tag">Permisos</span>
                    </div>
                  </div>
                  <i className="fas fa-arrow-right sf-tool-card__arrow" />
                </a>
              </div>
            </div>
          )}

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
