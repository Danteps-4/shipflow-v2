"use client";

import { useEffect, useState, useCallback } from "react";

// Pestaña "Inventario" de /stock: estados de stock (reservado, defectuoso, en
// revisión), devoluciones, reclasificaciones y recuentos con aprobación.
// Solo se muestra con el motor de inventario nuevo prendido (INVENTARIO_V2).

interface Fila {
  sku: string; nombre: string; fisico: number; reservado: number; disponible: number; defectuoso: number; enRevision: number;
}
interface Recuento {
  id: number; sku: string; cantidadTeorica: number; cantidadContada: number; diferencia: number; motivo: string;
  estado: "pendiente" | "aprobado" | "rechazado"; contadoPor: string; resueltoPor: string | null; createdAt: string;
}
type Estado = "apto" | "defectuoso" | "revision";
type Accion =
  | { tipo: "devolucion"; sku: string; nombre: string }
  | { tipo: "mover"; sku: string; nombre: string }
  | { tipo: "recuento"; sku: string; nombre: string; fisico: number };

const ETIQUETA_ESTADO: Record<Estado, string> = { apto: "Vendible", defectuoso: "Defectuoso", revision: "En revisión" };

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function InventarioPanel() {
  const [items, setItems] = useState<Fila[]>([]);
  const [pendientes, setPendientes] = useState<Recuento[]>([]);
  const [resueltos, setResueltos] = useState<Recuento[]>([]);
  const [puedeAprobar, setPuedeAprobar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [accion, setAccion] = useState<Accion | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [de, setDe] = useState<Estado>("apto");
  const [a, setA] = useState<Estado>("defectuoso");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/stock/inventario");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo cargar el inventario");
      const d = await r.json();
      setItems(d.items ?? []);
      setPendientes(d.pendientes ?? []);
      setResueltos(d.resueltos ?? []);
      setPuedeAprobar(!!d.puedeAprobar);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrir(nueva: Accion) {
    setAccion(nueva); setCantidad(""); setMotivo(""); setErrorForm(null);
    setDe("apto"); setA("defectuoso");
  }

  async function enviar() {
    if (!accion) return;
    setEnviando(true); setErrorForm(null);
    try {
      const body: Record<string, unknown> = { accion: accion.tipo, sku: accion.sku, motivo };
      if (accion.tipo === "recuento") body.cantidadContada = Number(cantidad);
      else body.cantidad = Number(cantidad);
      if (accion.tipo === "mover") { body.de = de; body.a = a; }
      const r = await fetch("/api/stock/inventario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "No se pudo guardar");
      setAviso(accion.tipo === "recuento"
        ? (data.recuento?.estado === "aprobado" ? "Lo contado coincide con el sistema: no hace falta ajustar nada." : "Recuento enviado: queda pendiente de aprobación de un administrador.")
        : "Listo, quedó registrado.");
      setAccion(null);
      await cargar();
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : "Error");
    } finally {
      setEnviando(false);
    }
  }

  async function resolver(id: number, resolucion: "aprobar" | "rechazar") {
    const r0 = pendientes.find(p => p.id === id);
    if (resolucion === "aprobar" && r0 && !confirm(`¿Aprobar el recuento de ${r0.sku}? Se va a ajustar el stock en ${r0.diferencia > 0 ? "+" : ""}${r0.diferencia}.`)) return;
    setResolviendo(id); setError(null);
    try {
      const r = await fetch("/api/stock/inventario", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, resolucion }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "No se pudo resolver");
      setAviso(resolucion === "aprobar" ? "Recuento aprobado: el stock quedó ajustado." : "Recuento rechazado: el stock no se tocó.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setResolviendo(null);
    }
  }

  const q = busqueda.trim().toLowerCase();
  const filas = items.filter(i => !q || i.sku.toLowerCase().includes(q) || i.nombre.toLowerCase().includes(q));
  const totales = items.reduce((t, i) => ({ fisico: t.fisico + i.fisico, reservado: t.reservado + i.reservado, defectuoso: t.defectuoso + i.defectuoso, enRevision: t.enRevision + i.enRevision }), { fisico: 0, reservado: 0, defectuoso: 0, enRevision: 0 });
  const num = (n: number, color?: string) => <span style={{ fontWeight: n !== 0 ? 700 : 400, color: n === 0 ? "var(--text-muted)" : color }}>{n}</span>;

  if (cargando) return <div style={{ color: "var(--text-muted)", padding: "1rem 0" }}><i className="fas fa-spinner fa-spin" /> Cargando…</div>;

  return (
    <>
      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        <b>Vendible</b> es lo que hay físicamente apto para vender; <b>Disponible</b> es Vendible menos lo reservado a pedidos. Las devoluciones entran a <b>En revisión</b> y no se pueden vender hasta que alguien las verifica.
      </p>

      {error && <div className="sf-alert sf-alert-warning" style={{ marginBottom: "1rem" }}><i className="fas fa-circle-exclamation" /><span>{error}</span></div>}
      {aviso && <div className="sf-alert" style={{ marginBottom: "1rem" }}><i className="fas fa-circle-info" /><span>{aviso}</span></div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {[
          ["Vendible", totales.fisico, "var(--success-color)"], ["Reservado", totales.reservado, "#f59e0b"],
          ["Defectuoso", totales.defectuoso, "var(--error-color)"], ["En revisión", totales.enRevision, "#38bdf8"],
        ].map(([t, n, c]) => (
          <div key={t as string} style={{ border: "1px solid var(--border-color)", borderLeft: `3px solid ${c}`, borderRadius: "var(--radius)", padding: "0.7rem 0.9rem", background: "rgba(15,23,42,0.4)" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{t as string}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: c as string }}>{n as number}</div>
          </div>
        ))}
      </div>

      {pendientes.length > 0 && (
        <div style={{ border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)", borderRadius: "var(--radius)", padding: "0.9rem 1rem", marginBottom: "1.25rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.6rem" }}><i className="fas fa-clipboard-check" style={{ color: "#f59e0b" }} /> Recuentos pendientes de aprobación ({pendientes.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {pendientes.map(p => (
              <div key={p.id} style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.85rem" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{p.sku}</span>
                <span>sistema {p.cantidadTeorica} → contado {p.cantidadContada}</span>
                <span style={{ fontWeight: 700, color: p.diferencia < 0 ? "var(--error-color)" : "var(--success-color)" }}>({p.diferencia > 0 ? "+" : ""}{p.diferencia})</span>
                <span style={{ color: "var(--text-muted)" }}>{p.contadoPor} · {fmtFecha(p.createdAt)}{p.motivo ? ` · ${p.motivo}` : ""}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
                  {puedeAprobar ? (
                    <>
                      <button className="sf-btn" disabled={resolviendo === p.id} onClick={() => resolver(p.id, "aprobar")}><i className="fas fa-check" /> Aprobar</button>
                      <button className="sf-btn sf-btn-secondary" disabled={resolviendo === p.id} onClick={() => resolver(p.id, "rechazar")}>Rechazar</button>
                    </>
                  ) : <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Esperando a un administrador</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <input className="sf-input" style={{ maxWidth: 280, marginBottom: "1rem" }} placeholder="Buscar SKU o nombre…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />

      <div className="sf-table-wrap">
        <table className="sf-table">
          <thead>
            <tr>
              <th>SKU</th><th>Nombre</th>
              <th style={{ textAlign: "right" }}>Vendible</th><th style={{ textAlign: "right" }}>Reservado</th>
              <th style={{ textAlign: "right" }}>Disponible</th><th style={{ textAlign: "right" }}>Defectuoso</th>
              <th style={{ textAlign: "right" }}>En revisión</th><th style={{ width: "1px" }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((i, k) => (
              <tr key={i.sku} className={k % 2 === 0 ? "row-even" : "row-odd"}>
                <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{i.sku}</td>
                <td>{i.nombre || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin nombre</span>}</td>
                <td style={{ textAlign: "right" }}>{num(i.fisico)}</td>
                <td style={{ textAlign: "right" }}>{num(i.reservado, "#f59e0b")}</td>
                <td style={{ textAlign: "right" }}>{num(i.disponible, i.disponible <= 0 ? "var(--error-color)" : "var(--success-color)")}</td>
                <td style={{ textAlign: "right" }}>{num(i.defectuoso, "var(--error-color)")}</td>
                <td style={{ textAlign: "right" }}>{num(i.enRevision, "#38bdf8")}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.35rem", whiteSpace: "nowrap" }}>
                    <button className="sf-btn-edit" title="Contar (recuento)" onClick={() => abrir({ tipo: "recuento", sku: i.sku, nombre: i.nombre, fisico: i.fisico })}><i className="fas fa-clipboard-list" /></button>
                    <button className="sf-btn-edit" title="Ingresar devolución" onClick={() => abrir({ tipo: "devolucion", sku: i.sku, nombre: i.nombre })}><i className="fas fa-rotate-left" /></button>
                    <button className="sf-btn-edit" title="Mover entre estados" onClick={() => abrir({ tipo: "mover", sku: i.sku, nombre: i.nombre })}><i className="fas fa-right-left" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resueltos.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Últimos recuentos resueltos</div>
          {resueltos.map(r => (
            <div key={r.id} style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
              <span style={{ fontFamily: "monospace", color: "var(--text-color)" }}>{r.sku}</span> {r.diferencia === 0 ? "coincidía" : `${r.diferencia > 0 ? "+" : ""}${r.diferencia}`} ·{" "}
              <b style={{ color: r.estado === "aprobado" ? "var(--success-color)" : "var(--error-color)" }}>{r.estado}</b>
              {r.resueltoPor && r.resueltoPor !== "(coincide)" ? ` por ${r.resueltoPor}` : ""} · {fmtFecha(r.createdAt)}
            </div>
          ))}
        </div>
      )}

      {accion && (
        <>
          <div className="sf-modal-backdrop" onClick={() => !enviando && setAccion(null)} />
          <div className="sf-modal" role="dialog" style={{ width: "min(440px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                {accion.tipo === "recuento" ? "Recuento" : accion.tipo === "devolucion" ? "Ingresar devolución" : "Mover entre estados"} · <span style={{ fontFamily: "monospace" }}>{accion.sku}</span>
              </h3>
              <button className="sf-close-btn" onClick={() => !enviando && setAccion(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {errorForm && <div className="sf-alert sf-alert-warning"><i className="fas fa-circle-exclamation" /><span>{errorForm}</span></div>}

              {accion.tipo === "mover" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                  <label className="sf-label">De
                    <select className="sf-input" value={de} onChange={e => setDe(e.target.value as Estado)}>
                      {(Object.keys(ETIQUETA_ESTADO) as Estado[]).map(x => <option key={x} value={x}>{ETIQUETA_ESTADO[x]}</option>)}
                    </select>
                  </label>
                  <label className="sf-label">A
                    <select className="sf-input" value={a} onChange={e => setA(e.target.value as Estado)}>
                      {(Object.keys(ETIQUETA_ESTADO) as Estado[]).map(x => <option key={x} value={x}>{ETIQUETA_ESTADO[x]}</option>)}
                    </select>
                  </label>
                </div>
              )}

              <label className="sf-label">
                {accion.tipo === "recuento" ? "Cantidad contada (unidades vendibles)" : "Cantidad"}
                <input className="sf-input" type="number" min="0" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus />
                {accion.tipo === "recuento" && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>El sistema dice {accion.fisico}. No se ajusta nada hasta que un administrador lo apruebe.</span>}
              </label>

              <label className="sf-label">
                Motivo{accion.tipo === "mover" ? " (obligatorio)" : " (opcional)"}
                <input className="sf-input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={accion.tipo === "devolucion" ? "Ej: Devolución pedido #1234" : accion.tipo === "mover" ? "Ej: Caja rota" : "Ej: Conteo semanal"} />
              </label>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setAccion(null)} disabled={enviando}>Cancelar</button>
              <button className="sf-btn" onClick={enviar} disabled={enviando || cantidad === "" || (accion.tipo === "mover" && (!motivo.trim() || de === a))}>
                {enviando ? <><i className="fas fa-spinner fa-spin" /> Guardando…</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
