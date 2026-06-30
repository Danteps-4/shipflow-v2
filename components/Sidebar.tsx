"use client";

import { usePathname } from "next/navigation";

type NavLink = { href: string; icon: string; label: string };
type NavGroup = { label: string; links: NavLink[] };

const TOP_LINK: NavLink = { href: "/", icon: "fas fa-house", label: "Inicio" };

const GROUPS: NavGroup[] = [
  {
    label: "Pedidos",
    links: [
      { href: "/orders", icon: "fas fa-receipt", label: "Pedidos" },
      { href: "/procesar", icon: "fas fa-file-excel", label: "Procesar Pedidos" },
      { href: "/etiquetas", icon: "fas fa-tags", label: "Agregar SKU a Etiquetas" },
      { href: "/tracking", icon: "fas fa-truck", label: "Subir Tracking" },
    ],
  },
  {
    label: "Mercado Libre",
    links: [
      { href: "/etiquetas-ml", icon: "fas fa-barcode", label: "Etiquetas ML (ZPL → PDF)" },
    ],
  },
  {
    label: "Stock",
    links: [
      { href: "/stock", icon: "fas fa-warehouse", label: "Stock de Productos" },
    ],
  },
  {
    label: "Finanzas",
    links: [
      { href: "/finanzas", icon: "fas fa-chart-pie", label: "Gastos y Suscripciones" },
    ],
  },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

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

          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="sf-nav-group-label">{group.label}</div>
              {group.links.map((link) => (
                <a key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""}>
                  <i className={link.icon} /> {link.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className={`sf-overlay ${open ? "open" : ""}`} onClick={onClose} />
    </>
  );
}
