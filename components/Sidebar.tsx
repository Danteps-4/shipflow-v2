"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { ModuleKey } from "@/lib/modules";
import { NAV_GROUPS, Apartado, hasLinkAccess } from "@/lib/navGroups";

type NavLink = { href: string; icon: string; label: string };

const TOP_LINK: NavLink = { href: "/", icon: "fas fa-house", label: "Inicio" };

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;
  const groupHasActiveLink = (group: Apartado) => group.subApartados.some((l) => isActive(l.href));

  const [role, setRole]       = useState<"admin" | "member" | null>(null);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [linkAccess, setLinkAccess] = useState<string[] | undefined>(undefined);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  // Al cargar, abre solo el grupo que contiene la página actual.
  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const group of NAV_GROUPS) {
        if (groupHasActiveLink(group) && next[group.label] === undefined) next[group.label] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isAdmin = role === "admin";
  const visibleGroups = NAV_GROUPS
    .filter((g) => isAdmin || modules.includes(g.module))
    .map((g) => ({
      ...g,
      subApartados: g.subApartados.filter((l) => isAdmin || hasLinkAccess(linkAccess, l.href)),
    }))
    .filter((g) => g.subApartados.length > 0);

  function toggleGroup(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !(prev[label] ?? groupHasActiveLink(NAV_GROUPS.find((g) => g.label === label)!)) }));
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
                  {group.subApartados.map((link) => (
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
