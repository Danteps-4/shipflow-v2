"use client";

import { useState, useEffect } from "react";
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

  const [role, setRole]       = useState<"admin" | "member" | null>(null);
  const [modules, setModules] = useState<ModuleKey[]>([]);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => {
        setRole(d.user?.role ?? null);
        setModules(d.user?.modules ?? []);
      })
      .catch(() => {});
  }, []);

  const isAdmin = role === "admin";
  const visibleGroups = GROUPS.filter((g) => isAdmin || modules.includes(g.module));

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

          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="sf-nav-group-label">{group.label}</div>
              {group.links.map((link) => (
                <a key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""}>
                  <i className={link.icon} /> {link.label}
                </a>
              ))}
            </div>
          ))}

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
