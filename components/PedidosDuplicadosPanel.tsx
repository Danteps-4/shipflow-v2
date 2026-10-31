"use client";

import { useMemo, useState } from "react";
import type { GroupedOrder } from "@/types/orders";
import { detectarDuplicados } from "@/lib/pedidosCombinados";
import { slugify } from "@/lib/normalizers";

interface Props {
  orders: GroupedOrder[];
  onCombinar: (principal: string, secundarias: string[]) => void;
  onDeshacer: (principal: string) => void;
}

function destino(o: GroupedOrder): string {
  if (o.medioEnvio.trim().toLowerCase() === "punto de retiro") {
    return `Sucursal: ${o.sucursal || "sin definir"}`;
  }
  const dir = [o.direccion, o.numeroDireccion].filter(Boolean).join(" ");
  const loc = o.ciudad || o.localidad;
  return `${dir || "sin dirección"}${loc ? `, ${loc}` : ""}${o.codigoPostal ? ` (${o.codigoPostal})` : ""}`;
}

function productosTexto(o: GroupedOrder): string {
  const prods = o.productos ?? [];
  if (prods.length === 0) return "sin productos detectados";
  return prods.map(p => `${p.sku || p.nombre}${p.cantidad > 1 ? ` ×${p.cantidad}` : ""}`).join(" · ");
}

interface Seleccion { principal: string; incluidas: string[] }

export default function PedidosDuplicadosPanel({ orders, onCombinar, onDeshacer }: Props) {
  const grupos = useMemo(() => detectarDuplicados(orders), [orders]);
  const combinados = orders.filter(o => o.combinadas && o.combinadas.length > 0);

  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const [selecciones, setSelecciones] = useState<Record<string, Seleccion>>({});

  const visibles = grupos.filter(g => !descartados.has(g.clave));
  if (visibles.length === 0 && combinados.length === 0) return null;

  function seleccionDe(clave: string, numeros: string[]): Seleccion {
    return selecciones[clave] ?? { principal: numeros[0], incluidas: numeros };
  }

  function actualizar(clave: string, numeros: string[], cambio: Partial<Seleccion>) {
    setSelecciones(prev => ({ ...prev, [clave]: { ...seleccionDe(clave, numeros), ...cambio } }));
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {visibles.length > 0 && (
        <div style={{
          border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)",
          borderRadius: "var(--radius)", padding: "1rem 1.1rem", marginBottom: combinados.length > 0 ? "1rem" : 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.25rem" }}>
            <i className="fas fa-clone" style={{ color: "#f59e0b" }} />
            <strong>Posibles pedidos del mismo cliente ({visibles.length})</strong>
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.9rem" }}>
            Si los combinás, salen en un solo envío (pagás uno solo) y la etiqueta lleva los productos de todos.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            {visibles.map(g => {
              const numeros = g.ordenes.map(o => o.numeroOrden);
              const sel = seleccionDe(g.clave, numeros);
              const incluidas = g.ordenes.filter(o => sel.incluidas.includes(o.numeroOrden));
              const destinos = new Set(incluidas.map(o => slugify(destino(o))));
              const puedeCombinar = incluidas.length >= 2 && sel.incluidas.includes(sel.principal);
              return (
                <div key={g.clave} style={{
                  border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
                  background: "rgba(15,23,42,0.5)", padding: "0.8rem 0.9rem",
                }}>
                  <div style={{ fontSize: "0.75rem", color: "#f59e0b", marginBottom: "0.5rem" }}>
                    Coinciden: {g.motivos.join(", ")}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {g.ordenes.map(o => {
                      const incluida = sel.incluidas.includes(o.numeroOrden);
                      return (
                        <div key={o.numeroOrden} style={{
                          display: "flex", gap: "0.7rem", alignItems: "flex-start",
                          opacity: incluida ? 1 : 0.5,
                        }}>
                          <input
                            type="checkbox" checked={incluida} style={{ marginTop: "4px" }}
                            onChange={e => {
                              const nuevas = e.target.checked
                                ? [...sel.incluidas, o.numeroOrden]
                                : sel.incluidas.filter(n => n !== o.numeroOrden);
                              const principal = nuevas.includes(sel.principal) ? sel.principal : (nuevas[0] ?? sel.principal);
                              actualizar(g.clave, numeros, { incluidas: nuevas, principal });
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>#{o.numeroOrden}</span>
                              <span>{o.nombreEnvio || "—"}</span>
                              <label style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
                                <input
                                  type="radio" name={`principal-${g.clave}`} disabled={!incluida}
                                  checked={sel.principal === o.numeroOrden}
                                  onChange={() => actualizar(g.clave, numeros, { principal: o.numeroOrden })}
                                  style={{ marginRight: "0.3rem" }}
                                />
                                Pedido principal
                              </label>
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{destino(o)}</div>
                            <div style={{ fontSize: "0.78rem", fontFamily: "monospace" }}>{productosTexto(o)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {destinos.size > 1 && (
                    <div style={{ fontSize: "0.78rem", color: "#f59e0b", marginTop: "0.6rem" }}>
                      <i className="fas fa-triangle-exclamation" /> Los destinos son distintos: el paquete va al del pedido principal.
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem", flexWrap: "wrap" }}>
                    <button
                      className="sf-btn" disabled={!puedeCombinar}
                      onClick={() => onCombinar(sel.principal, incluidas.map(o => o.numeroOrden).filter(n => n !== sel.principal))}
                    >
                      <i className="fas fa-object-group" /> Combinar en un solo envío
                    </button>
                    <button
                      className="sf-btn sf-btn-secondary"
                      onClick={() => setDescartados(prev => new Set(prev).add(g.clave))}
                    >
                      No es el mismo cliente
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {combinados.length > 0 && (
        <div style={{
          border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.06)",
          borderRadius: "var(--radius)", padding: "1rem 1.1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.6rem" }}>
            <i className="fas fa-object-group" style={{ color: "var(--success-color)" }} />
            <strong>Envíos combinados ({combinados.length})</strong>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {combinados.map(o => (
              <div key={o.numeroOrden} style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", fontWeight: 700 }}>#{o.numeroOrden}</span>
                    {o.combinadas!.map(c => (
                      <span key={c.numeroOrden} style={{ fontFamily: "monospace", fontWeight: 700 }}> + #{c.numeroOrden}</span>
                    ))}
                    <span style={{ marginLeft: "0.6rem" }}>{o.nombreEnvio}</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{destino(o)}</div>
                  <div style={{ fontSize: "0.78rem", fontFamily: "monospace" }}>
                    {[o, ...o.combinadas!].map(x => productosTexto(x)).join("  +  ")}
                  </div>
                </div>
                <button className="sf-btn sf-btn-secondary" onClick={() => onDeshacer(o.numeroOrden)}>
                  <i className="fas fa-rotate-left" /> Deshacer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
