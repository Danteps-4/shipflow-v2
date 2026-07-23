"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { ModuleKey } from "@/lib/modules";

type NavLink = { href: string; icon: string; label: string };
type NavGroup = { label: string; module: ModuleKey; links: NavLink[] };

const TOP_LINK: NavLink = { href: "/", icon: "fas fa-house", label: "Inicio" };

const GROUPS: NavGroup[] = [
  {
    label: "Pedidos",
    module: "pedidos",
    links: [
      { href: "/orders", icon: "fas fa-receipt", label: "Pedidos" },
      { href: "/procesar", icon: "fas fa-file-excel", label: "Procesar Pedidos" },
      { href: "/etiquetas", icon: "fas fa-tags", label: "Agregar SKU a Etiquetas" },
      { href: "/tracking", icon: "fas fa-truck", label: "Subir Tracking" },
    ],
  },
  {
    label: "Mercado Libre",
    module: "mercadolibre",
    links: [
      { href: "/mercadolibre", icon: "fas fa-plug", label: "Conectar Mercado Libre" },
      { href: "/mercadolibre/pedidos", icon: "fas fa-receipt", label: "Pedidos ML" },
      { href: "/etiquetas-ml", icon: "fas fa-barcode", label: "Etiquetas ML (ZPL → PDF)" },
    ],
  },
  {
    label: "Stock",
    module: "stock",
    links: [
      { href: "/stock", icon: "fas fa-warehouse", label: "Stock de Productos" },
    ],
  },
  {
    label: "Finanzas",
    module: "finanzas",
    links: [
      { href: "/finanzas", icon: "fas fa-chart-pie", label: "Gastos y Suscripciones" },
      { href: "/finanzas/transferencias", icon: "fas fa-money-bill-transfer", label: "Transferencias" },
    ],
  },
  {
    label: "Creativo",
    module: "creativo",
    links: [
      { href: "/creativo", icon: "fas fa-clapperboard", label: "Ángulos, guiones y formatos" },
    ],
  },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;
  const groupHasActiveLink = (group: NavGroup) => group.links.some((l) => isActive(l.href));

  const [role, setRole]       = useState<"admin" | "member" | null>(null);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => {
        setRole(d.user?.role ?? null);
        setModules(d.user?.modules ?? []);
      })
      .catch(() => {});
  }, []);

  // Al cargar, abre solo el grupo que contiene la página actual.
  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const group of GROUPS) {
        if (groupHasActiveLink(group) && next[group.label] === undefined) next[group.label] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isAdmin = role === "admin";
  const visibleGroups = GROUPS.filter((g) => isAdmin || modules.includes(g.module));

  function toggleGroup(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !(prev[label] ?? groupHasActiveLink(GROUPS.find((g) => g.label === label)!)) }));
  }

  return (
    <>
      <div className={`sf-sidebar ${open ? "open" : ""}`}>
        <div className="sf-sidebar-header">
          <h3>Menú</h3>
          <button className="sf-close-btn" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        </div>
        <nav className="sf-nav">
          <a href={TOP_LINK.href} className={isActive(TOP_LINK.href) ? "active" : ""}>
            <i className={TOP_LINK.icon} /> {TOP_LINK.label}
          </a>

          {visibleGroups.map((group) => {
            const isOpen = expanded[group.label] ?? groupHasActiveLink(group);
            return (
              <div key={group.label} className="sf-nav-group">
                <button
                  type="button"
                  className={`sf-nav-group-label sf-nav-group-toggle ${isOpen ? "open" : ""}`}
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isOpen}
                >
                  <span>{group.label}</span>
                  <i
                    className="fas fa-chevron-down sf-nav-group-chevron"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
                <CollapsibleLinks isOpen={isOpen}>
                  {group.links.map((link) => (
                    <a key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""}>
                      <i className={link.icon} /> {link.label}
                    </a>
                  ))}
                </CollapsibleLinks>
              </div>
            );
          })}

          {isAdmin && (
            <div>
              <div className="sf-nav-group-label">Administración</div>
              <a href="/equipo" className={isActive("/equipo") ? "active" : ""}>
                <i className="fas fa-users-gear" /> Equipo
              </a>
            </div>
          )}
        </nav>
      </div>

      <div className={`sf-overlay ${open ? "open" : ""}`} onClick={onClose} />
    </>
  );
}

// Colapsa/expande midiendo la altura real del contenido y aplicándola
// directamente al DOM (más confiable que animar grid-template-rows, que no
// se recalcula bien en todos los navegadores).
function CollapsibleLinks({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!outerRef.current || !innerRef.current) return;
    outerRef.current.style.maxHeight = isOpen ? `${innerRef.current.scrollHeight}px` : "0px";
  }, [isOpen]);

  return (
    <div
      ref={outerRef}
      className={`sf-nav-group-links ${isOpen ? "open" : ""}`}
      style={{ maxHeight: isOpen ? undefined : 0 }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
