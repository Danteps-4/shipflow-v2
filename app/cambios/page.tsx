"use client";

import { useState, useEffect, useRef } from "react";
import StoreSwitcher from "@/components/StoreSwitcher";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import { ANDREANI_SUCURSALES } from "@/lib/andreaniData";

type TipoCambio = "domicilio" | "sucursal";

interface Cambio {
  id: number;
  nombre: string;
  telefono: string;
  email: string | null;
  dni: string | null;
  motivo: string | null;
  numero_pedido_original: string | null;
  tipo: TipoCambio;
  direccion: string;
  numero_direccion: string;
  piso: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  sucursal: string;
  procesado: boolean;
  created_by: string;
  created_at: string;
}

interface DireccionSugerida { label: string; lat: number; lng: number; }
interface SucursalCercana { nombre: string; direccion: string; distanciaKm: number; horario: string | null; }

// Datos mínimos de un pedido de Tienda Nube que nos importan para
// prellenar un cambio (no filtramos por estado: el pedido original de un
// cambio ya está entregado, así que no puede filtrarse por "unshipped"
// como hace el importador de /procesar).
interface TnOrderResumen {
  number: number;
  contact_name: string;
  contact_phone?: string;
  contact_email: string;
  contact_identification?: string | null;
  shipping_address?: { phone?: string } | null;
}

const EMPTY_FORM = {
  nombre: "", telefono: "", email: "", dni: "", motivo: "", numeroPedidoOriginal: "",
  tipo: "sucursal" as TipoCambio,
  direccion: "", numeroDireccion: "", piso: "", localidad: "", provincia: "", codigoPostal: "",
  sucursal: "",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function CambiosPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendientes, setPendientes] = useState<Cambio[]>([]);
  const [procesados, setProcesados] = useState<Cambio[]>([]);
  const [verProcesados, setVerProcesados] = useState(false);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<Partial<Cambio> | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Buscador de dirección → sucursal más cercana
  const [busquedaDireccion, setBusquedaDireccion] = useState("");
  const [sugerencias, setSugerencias] = useState<DireccionSugerida[]>([]);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const [cercanas, setCercanas] = useState<SucursalCercana[]>([]);
  const [buscandoCercanas, setBuscandoCercanas] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buscador de pedido existente de Tienda Nube (para prellenar
  // nombre/teléfono/email/DNI sin tenerlos que volver a tipear)
  const [busquedaPedido, setBusquedaPedido] = useState("");
  const [resultadosPedido, setResultadosPedido] = useState<TnOrderResumen[]>([]);
  const [buscandoPedido, setBuscandoPedido] = useState(false);
  const [pedidoVinculado, setPedidoVinculado] = useState<string | null>(null);
  const debouncePedidoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCambios();
  }, []);

  async function fetchCambios() {
    setLoading(true);
    try {
      const [rPend, rProc] = await Promise.all([
        fetch("/api/cambios?procesado=false"),
        fetch("/api/cambios?procesado=true"),
      ]);
      if (rPend.ok) setPendientes((await rPend.json()).cambios ?? []);
      if (rProc.ok) setProcesados((await rProc.json()).cambios ?? []);
    } finally {
      setLoading(false);
    }
  }

  function abrirNuevo() {
    setModal({});
    setForm(EMPTY_FORM);
    resetBuscadorDireccion();
    resetBuscadorPedido(null);
  }

  function abrirEditar(c: Cambio) {
    setModal(c);
    setForm({
      nombre: c.nombre, telefono: c.telefono, email: c.email ?? "", dni: c.dni ?? "", motivo: c.motivo ?? "",
      numeroPedidoOriginal: c.numero_pedido_original ?? "",
      tipo: c.tipo,
      direccion: c.direccion, numeroDireccion: c.numero_direccion, piso: c.piso,
      localidad: c.localidad, provincia: c.provincia, codigoPostal: c.codigo_postal,
      sucursal: c.sucursal,
    });
    resetBuscadorDireccion();
    resetBuscadorPedido(c.numero_pedido_original);
  }

  function resetBuscadorDireccion() {
    setBusquedaDireccion(""); setSugerencias([]); setCercanas([]);
  }

  function resetBuscadorPedido(vinculadoActual: string | null) {
    setBusquedaPedido(""); setResultadosPedido([]); setPedidoVinculado(vinculadoActual);
  }

  function onBuscarPedido(value: string) {
    setBusquedaPedido(value);
    if (debouncePedidoRef.current) clearTimeout(debouncePedidoRef.current);
    if (value.trim().length < 2) { setResultadosPedido([]); return; }
    debouncePedidoRef.current = setTimeout(async () => {
      setBuscandoPedido(true);
      try {
        const res = await fetch(`/api/orders?q=${encodeURIComponent(value)}&per_page=8`);
        if (res.ok) {
          const data = await res.json();
          setResultadosPedido((data.orders ?? []) as TnOrderResumen[]);
        }
      } finally {
        setBuscandoPedido(false);
      }
    }, 400);
  }

  function elegirPedido(o: TnOrderResumen) {
    setForm(f => ({
      ...f,
      nombre: o.contact_name || f.nombre,
      telefono: o.contact_phone || o.shipping_address?.phone || f.telefono,
      email: o.contact_email || f.email,
      dni: o.contact_identification || f.dni,
      numeroPedidoOriginal: String(o.number),
    }));
    setPedidoVinculado(String(o.number));
    setBusquedaPedido("");
    setResultadosPedido([]);
  }

  function quitarVinculoPedido() {
    setPedidoVinculado(null);
    setForm(f => ({ ...f, numeroPedidoOriginal: "" }));
  }

  function onBuscarDireccion(value: string) {
    setBusquedaDireccion(value);
    setCercanas([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 4) { setSugerencias([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscandoDireccion(true);
      try {
        const res = await fetch(`/api/andreani/geocode?q=${encodeURIComponent(value)}`);
        if (res.ok) setSugerencias((await res.json()).direcciones ?? []);
      } finally {
        setBuscandoDireccion(false);
      }
    }, 400);
  }

  async function elegirDireccion(d: DireccionSugerida) {
    setBusquedaDireccion(d.label);
    setSugerencias([]);
    setBuscandoCercanas(true);
    try {
      const res = await fetch(`/api/andreani/sucursales-cercanas?lat=${d.lat}&lng=${d.lng}`);
      if (res.ok) {
        const lista: SucursalCercana[] = (await res.json()).sucursales ?? [];
        setCercanas(lista);
        if (lista.length > 0) setForm(f => ({ ...f, sucursal: lista[0].nombre }));
      }
    } finally {
      setBuscandoCercanas(false);
    }
  }

  async function guardar() {
    setSaving(true);
    try {
      const isEdit = !!modal?.id;
      const body = { ...(isEdit ? { id: modal!.id } : {}), ...form };
      const res = await fetch("/api/cambios", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setModal(null); await fetchCambios(); }
      else { const d = await res.json().catch(() => null); alert(d?.error ?? "Error al guardar"); }
    } finally {
      setSaving(false);
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar este cambio?")) return;
    await fetch("/api/cambios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchCambios();
  }

  const puedeGuardar =
    form.nombre.trim() && form.telefono.trim() &&
    (form.tipo === "sucursal" ? !!form.sucursal.trim() : !!(form.direccion.trim() && form.numeroDireccion.trim()));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="sf-header">
        <button className="sf-menu-toggle" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars" />
        </button>
        <a href="/" className="sf-brand"><i className="fas fa-rocket" /> ShipFlow</a>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StoreSwitcher /><UserMenu />
        </div>
      </header>

      <main className="sf-main">
        <div className="sf-container">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Cambios</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Cargá envíos de reposición que no vienen de un pedido de Tienda Nube. Se suman al Excel de Andreani desde &quot;Procesar Pedidos&quot;.
          </p>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <button className="sf-btn" onClick={abrirNuevo}>
              <i className="fas fa-plus" /> Nuevo cambio
            </button>
            <button
              className="sf-btn sf-btn-secondary"
              onClick={() => setVerProcesados(v => !v)}
            >
              <i className={`fas fa-${verProcesados ? "clock" : "check"}`} />
              {verProcesados ? " Ver pendientes" : ` Ver procesados (${procesados.length})`}
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "1.5rem" }} />
            </div>
          ) : (
            <CambiosList
              items={verProcesados ? procesados : pendientes}
              procesados={verProcesados}
              onEditar={abrirEditar}
              onBorrar={borrar}
            />
          )}
        </div>
      </main>

      <footer className="sf-footer">
        <i className="fas fa-rocket" style={{ color: "var(--primary-color)", marginRight: "0.4rem" }} />
        ShipFlow
      </footer>

      {modal !== null && (
        <>
          <div className="sf-modal-backdrop" onClick={() => setModal(null)} />
          <div className="sf-modal" role="dialog" aria-modal="true" style={{ width: "min(560px, calc(100vw - 2rem))" }}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                <i className="fas fa-right-left" style={{ color: "var(--primary-color)" }} />
                {modal.id ? "Editar cambio" : "Nuevo cambio"}
              </h3>
              <button className="sf-close-btn" onClick={() => setModal(null)}><i className="fas fa-times" /></button>
            </div>

            <div className="sf-modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ position: "relative" }}>
                <label className="sf-label">
                  Pedido original en Tienda Nube (opcional)
                  <input
                    className="sf-input" value={busquedaPedido}
                    onChange={e => onBuscarPedido(e.target.value)}
                    placeholder="Buscar por número de pedido o nombre del cliente..."
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>
                    Elegilo para completar nombre, teléfono, email y DNI automáticamente.
                  </span>
                </label>
                {buscandoPedido && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                    <i className="fas fa-spinner fa-spin" /> Buscando...
                  </div>
                )}
                {resultadosPedido.length > 0 && (
                  <div style={{
                    position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0,
                    background: "var(--bg-color, #0f172a)", border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius)", marginTop: "0.25rem", maxHeight: 220, overflowY: "auto",
                  }}>
                    {resultadosPedido.map((o, i) => (
                      <div
                        key={o.number} onClick={() => elegirPedido(o)}
                        style={{ padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.82rem", borderBottom: i < resultadosPedido.length - 1 ? "1px solid var(--border-color)" : "none" }}
                      >
                        <strong>#{o.number}</strong> — {o.contact_name}
                      </div>
                    ))}
                  </div>
                )}
                {pedidoVinculado && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <span className="sf-badge" style={{ background: "rgba(16,185,129,0.12)", color: "var(--success-color)" }}>
                      <i className="fas fa-link" /> Vinculado a pedido #{pedidoVinculado}
                    </span>
                    <button
                      type="button" onClick={quitarVinculoPedido}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", textDecoration: "underline" }}
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Nombre y apellido
                  <input className="sf-input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
                </label>
                <label className="sf-label">
                  Teléfono
                  <input className="sf-input" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="sf-label">
                  Email (opcional)
                  <input className="sf-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </label>
                <label className="sf-label">
                  DNI (opcional)
                  <input className="sf-input" value={form.dni} onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} />
                </label>
              </div>
              <label className="sf-label">
                Motivo (opcional)
                <input
                  className="sf-input" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ej: cambio de talle - pedido original #1234"
                />
              </label>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                {(["sucursal", "domicilio"] as TipoCambio[]).map(t => (
                  <button
                    key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, tipo: t }))}
                    style={{
                      flex: 1, padding: "0.5rem", borderRadius: "var(--radius)", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                      border: `1px solid ${form.tipo === t ? "var(--primary-color)" : "var(--border-color)"}`,
                      background: form.tipo === t ? "var(--primary-color)" : "transparent",
                      color: form.tipo === t ? "#fff" : "var(--text-muted)",
                    }}
                  >
                    {t === "sucursal" ? "A sucursal (más económico)" : "A domicilio"}
                  </button>
                ))}
              </div>

              {form.tipo === "sucursal" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ position: "relative" }}>
                    <label className="sf-label">
                      Dirección del cliente (para sugerir la sucursal más cercana)
                      <input
                        className="sf-input" value={busquedaDireccion}
                        onChange={e => onBuscarDireccion(e.target.value)}
                        placeholder="Ej: Av Corrientes 1234, CABA"
                      />
                    </label>
                    {buscandoDireccion && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                        <i className="fas fa-spinner fa-spin" /> Buscando...
                      </div>
                    )}
                    {sugerencias.length > 0 && (
                      <div style={{
                        position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0,
                        background: "var(--bg-color, #0f172a)", border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius)", marginTop: "0.25rem", maxHeight: 220, overflowY: "auto",
                      }}>
                        {sugerencias.map((s, i) => (
                          <div
                            key={i} onClick={() => elegirDireccion(s)}
                            style={{ padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.82rem", borderBottom: i < sugerencias.length - 1 ? "1px solid var(--border-color)" : "none" }}
                          >
                            {s.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {buscandoCercanas && (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      <i className="fas fa-spinner fa-spin" /> Buscando sucursales cercanas...
                    </div>
                  )}

                  {cercanas.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Sucursales cercanas
                      </span>
                      {cercanas.slice(0, 5).map(s => (
                        <label
                          key={s.nombre}
                          style={{
                            display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.65rem",
                            border: `1px solid ${form.sucursal === s.nombre ? "var(--primary-color)" : "var(--border-color)"}`,
                            borderRadius: "var(--radius)", cursor: "pointer",
                          }}
                        >
                          <input type="radio" name="sucursal-cercana" checked={form.sucursal === s.nombre} onChange={() => setForm(f => ({ ...f, sucursal: s.nombre }))} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{s.nombre}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{s.direccion}</div>
                          </div>
                          <span className="sf-badge" style={{ flexShrink: 0 }}>{s.distanciaKm} km</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <label className="sf-label">
                    O escribí el nombre de la sucursal directamente
                    <input
                      className="sf-input" value={form.sucursal}
                      onChange={e => setForm(f => ({ ...f, sucursal: e.target.value }))}
                      list="sucursales-list-cambios" placeholder="Ej: PALERMO (AV SCALABRINI ORTIZ)"
                    />
                    <datalist id="sucursales-list-cambios">
                      {ANDREANI_SUCURSALES.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </label>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
                    <label className="sf-label">
                      Calle
                      <input className="sf-input" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
                    </label>
                    <label className="sf-label">
                      Número
                      <input className="sf-input" value={form.numeroDireccion} onChange={e => setForm(f => ({ ...f, numeroDireccion: e.target.value }))} />
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "0.75rem" }}>
                    <label className="sf-label">
                      Piso (opcional)
                      <input className="sf-input" value={form.piso} onChange={e => setForm(f => ({ ...f, piso: e.target.value }))} />
                    </label>
                    <label className="sf-label">
                      Localidad
                      <input className="sf-input" value={form.localidad} onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} />
                    </label>
                    <label className="sf-label">
                      CP
                      <input className="sf-input" value={form.codigoPostal} onChange={e => setForm(f => ({ ...f, codigoPostal: e.target.value }))} />
                    </label>
                  </div>
                  <label className="sf-label">
                    Provincia
                    <input className="sf-input" value={form.provincia} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} />
                  </label>
                </div>
              )}
            </div>

            <div className="sf-modal-footer">
              <button className="sf-btn sf-btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="sf-btn" onClick={guardar} disabled={saving || !puedeGuardar}>
                {saving ? <><i className="fas fa-spinner fa-spin" /> Guardando...</> : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CambiosList({
  items, procesados, onEditar, onBorrar,
}: {
  items: Cambio[]; procesados: boolean;
  onEditar: (c: Cambio) => void; onBorrar: (id: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="sf-empty">
        <i className="fas fa-right-left sf-empty-icon" />
        <p style={{ fontWeight: 600, color: "var(--text-color)" }}>
          {procesados ? "Todavía no exportaste ningún cambio." : "No hay cambios pendientes."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {items.map(c => (
        <div key={c.id} style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
          padding: "0.65rem 0.9rem", opacity: procesados ? 0.7 : 1,
        }}>
          <span className="sf-badge" style={{
            background: c.tipo === "sucursal" ? "rgba(167,139,250,0.15)" : "rgba(59,130,246,0.12)",
            color: c.tipo === "sucursal" ? "#a78bfa" : "#60a5fa",
          }}>
            {c.tipo === "sucursal" ? "Sucursal" : "Domicilio"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700 }}>{c.nombre}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {c.tipo === "sucursal" ? c.sucursal : `${c.direccion} ${c.numero_direccion}, ${c.localidad}`}
              {c.numero_pedido_original && <> · Pedido #{c.numero_pedido_original}</>}
              {c.motivo && <> · {c.motivo}</>}
            </div>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", flexShrink: 0 }}>
            {c.created_by && <>{c.created_by} · </>}{fmtDate(c.created_at)}
          </div>
          {!procesados && (
            <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
              <button onClick={() => onEditar(c)} title="Editar" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <i className="fas fa-pen" />
              </button>
              <button onClick={() => onBorrar(c.id)} title="Borrar" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <i className="fas fa-trash" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
