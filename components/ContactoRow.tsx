"use client";

// Fila de contacto editable (WhatsApp/Instagram/Email/etc), con link
// clickeable a la plataforma correspondiente cuando hay valor. Mismo patrón
// ya usado en app/soporte/page.tsx, extraído acá para reusar en Tickets sin
// duplicar la implementación (Soporte sigue con su propia copia inline, sin
// tocar).

export function whatsappHref(telefono: string) {
  return `https://wa.me/${telefono.replace(/\D/g, "")}`;
}

export function instagramHref(usuario: string) {
  return `https://instagram.com/${usuario.replace(/^@/, "").trim()}`;
}

export default function ContactoRow({
  icon, iconColor, label, value, href, editing, draft, setDraft, saving, placeholder, onStart, onCancel, onSave,
}: {
  icon: string; iconColor: string; label: string; value: string | null; href: string | undefined;
  editing: boolean; draft: string; setDraft: (v: string) => void; saving: boolean; placeholder: string;
  onStart: () => void; onCancel: () => void; onSave: () => void;
}) {
  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          className="sf-input"
          style={{ maxWidth: 220 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        />
        <button className="sf-icon-btn" onClick={onSave} disabled={saving} title="Guardar">
          {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
        </button>
        <button className="sf-icon-btn" onClick={onCancel} title="Cancelar">
          <i className="fas fa-times" />
        </button>
      </div>
    );
  }
  if (value && href) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: iconColor, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 600 }}
        >
          <i className={icon} /> {value}
        </a>
        <button className="sf-icon-btn" title={`Editar ${label.toLowerCase()}`} onClick={onStart} style={{ width: 26, height: 26, fontSize: "0.7rem" }}>
          <i className="fas fa-pen" />
        </button>
      </div>
    );
  }
  return (
    <button className="sf-btn sf-btn-secondary" onClick={onStart} style={{ fontSize: "0.78rem", alignSelf: "flex-start" }}>
      <i className={icon} /> Agregar {label.toLowerCase()}
    </button>
  );
}
