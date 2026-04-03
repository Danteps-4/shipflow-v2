"use client";

import { useState, useEffect } from "react";
import { GroupedOrder, ValidationError } from "@/types/orders";
import { ANDREANI_SUCURSALES } from "@/lib/andreaniData";

interface EditOrderModalProps {
  order: GroupedOrder;
  error: ValidationError;
  onSave: (updated: GroupedOrder) => void;
  onClose: () => void;
}

// Mapa de mensaje de error → campo del formulario
const ERROR_FIELD_MAP: Record<string, keyof GroupedOrder> = {
  "Falta nombre para el envío": "nombreEnvio",
  "Falta DNI": "dni",
  "Falta teléfono": "telefono",
  "Falta dirección": "direccion",
  "Falta número de puerta": "numeroDireccion",
  "Falta localidad/ciudad": "localidad",
  "Falta provincia": "provincia",
  "Falta código postal": "codigoPostal",
  "Falta sucursal de retiro": "sucursal",
};

export default function EditOrderModal({ order, error, onSave, onClose }: EditOrderModalProps) {
  const [form, setForm] = useState<GroupedOrder>({ ...order });

  // Cierra con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const errorFields = new Set(
    error.campos.map((c) => ERROR_FIELD_MAP[c]).filter(Boolean)
  );

  function set(field: keyof GroupedOrder, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    onSave(form);
  }

  const isDomicilio = error.tipo === "domicilio";

  return (
    <>
      {/* Backdrop */}
      <div className="sf-modal-backdrop" onClick={onClose} />

      {/* Modal */}
      <div className="sf-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="sf-modal-header">
          <div>
            <h3 className="sf-modal-title">
              <i className="fas fa-pen-to-square" style={{ color: "var(--primary-color)" }} />
              Editar pedido
              <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontWeight: 400 }}>
                &nbsp;#{order.numeroOrden}
              </span>
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
              {error.campos.map((c, i) => (
                <span key={i} className="sf-badge sf-badge-error" style={{ fontSize: "0.68rem" }}>
                  <i className="fas fa-triangle-exclamation" />
                  {c}
                </span>
              ))}
            </div>
          </div>
          <button className="sf-close-btn" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className="sf-modal-body">
          {/* Campos comunes */}
          <div className="sf-form-grid">
            <Field
              label="Nombre para el envío"
              value={form.nombreEnvio}
              onChange={(v) => set("nombreEnvio", v)}
              hasError={errorFields.has("nombreEnvio")}
            />
            <Field
              label="Teléfono"
              value={form.telefono}
              onChange={(v) => set("telefono", v)}
              hasError={errorFields.has("telefono")}
              inputMode="tel"
            />
          </div>
          {isDomicilio && (
            <div className="sf-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field
                label="DNI"
                value={form.dni}
                onChange={(v) => set("dni", v)}
                hasError={errorFields.has("dni")}
                inputMode="numeric"
              />
            </div>
          )}

          {isDomicilio ? (
            <>
              <div className="sf-form-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                <Field
                  label="Calle"
                  value={form.direccion}
                  onChange={(v) => set("direccion", v)}
                  hasError={errorFields.has("direccion")}
                />
                <Field
                  label="Número"
                  value={form.numeroDireccion}
                  onChange={(v) => set("numeroDireccion", v)}
                  hasError={errorFields.has("numeroDireccion")}
                />
                <Field
                  label="Piso"
                  value={form.piso}
                  onChange={(v) => set("piso", v)}
                  hasError={false}
                />
              </div>
              <div className="sf-form-grid" style={{ gridTemplateColumns: "2fr 2fr 1fr" }}>
                <Field
                  label="Localidad"
                  value={form.localidad}
                  onChange={(v) => set("localidad", v)}
                  hasError={errorFields.has("localidad")}
                />
                <Field
                  label="Provincia"
                  value={form.provincia}
                  onChange={(v) => set("provincia", v)}
                  hasError={errorFields.has("provincia")}
                />
                <Field
                  label="Código Postal"
                  value={form.codigoPostal}
                  onChange={(v) => set("codigoPostal", v)}
                  hasError={errorFields.has("codigoPostal")}
                />
              </div>
            </>
          ) : (
            <>
              {/* Dirección ingresada por el cliente (solo lectura, como referencia) */}
              {(order.direccion || order.localidad || order.provincia) && (
                <div className="sf-info-block">
                  <div className="sf-info-block-title">
                    <i className="fas fa-map-pin" />
                    Dirección ingresada por el cliente
                  </div>
                  <div className="sf-info-block-grid">
                    {order.direccion && (
                      <InfoRow label="Calle" value={`${order.direccion}${order.numeroDireccion ? ` ${order.numeroDireccion}` : ""}${order.piso ? `, piso ${order.piso}` : ""}`} />
                    )}
                    {order.localidad && (
                      <InfoRow label="Localidad" value={order.rawLocalidad || order.localidad} />
                    )}
                    {order.provincia && (
                      <InfoRow label="Provincia" value={order.rawProvincia || order.provincia} />
                    )}
                    {order.codigoPostal && (
                      <InfoRow label="Cód. Postal" value={order.rawCodigoPostal || order.codigoPostal} />
                    )}
                  </div>
                </div>
              )}

              {/* Campo editable de sucursal */}
              <div className="sf-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <Field
                  label="Sucursal Andreani"
                  value={form.sucursal}
                  onChange={(v) => set("sucursal", v)}
                  hasError={errorFields.has("sucursal")}
                  listId="sucursales-list"
                />
                <datalist id="sucursales-list">
                  {ANDREANI_SUCURSALES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sf-modal-footer">
          <button className="sf-btn sf-btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="sf-btn" onClick={handleSave}>
            <i className="fas fa-check" />
            Guardar cambios
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Fila de solo lectura (info del cliente) ───────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
        {label}
      </span>
      <span style={{ fontSize: "0.875rem", color: "var(--text-color)" }}>{value || "—"}</span>
    </div>
  );
}

// ─── Campo de formulario ────────────────────────────────────────
interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hasError: boolean;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  listId?: string;
}

function Field({ label, value, onChange, hasError, inputMode, listId }: FieldProps) {
  return (
    <div className="sf-form-field">
      <label className={`sf-form-label ${hasError ? "has-error" : ""}`}>
        {hasError && <i className="fas fa-circle-exclamation" style={{ marginRight: "0.3rem" }} />}
        {label}
      </label>
      <input
        className={`sf-form-input ${hasError ? "has-error" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        list={listId}
        autoComplete={listId ? "off" : undefined}
      />
    </div>
  );
}
