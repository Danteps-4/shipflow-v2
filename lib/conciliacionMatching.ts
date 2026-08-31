// Funciones puras de parseo/normalización/matching para la conciliación de
// transferencias (Telegram → Tiendanube). Sin DB ni red — testeables solas.
// Ver plan en C:\Users\Usuario\.claude\plans (Conciliación de Transferencias).

export interface TransferParsed {
  amountCents: number;
  senderName: string;
  cuitCuil: string | null;
  detectedDni: string | null;
  bankAccount: string | null;
  transactionId: string;
  receivedAt: Date | null;
}

export interface OrderCandidate {
  storeId: string;
  orderId: string;
  orderNumber: string;
  contactName: string;
  contactDni: string | null;
  totalCents: number;
  isTransferGateway: boolean;
}

export interface CandidateMatch {
  candidate: OrderCandidate;
  matchDni: boolean;
  matchAmount: boolean;
  matchName: boolean;
  matchMethod: boolean;
}

export type NivelConciliacion = "AUTO_MATCHED" | "REQUIRES_REVIEW" | "UNMATCHED";

export interface DecisionResultado {
  nivel: NivelConciliacion;
  seleccionado: CandidateMatch | null;
  candidatos: CandidateMatch[];
}

// ─── Parseo del mensaje de Telegram ─────────────────────────────────────────

function extraerCampo(texto: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*:\\s*(.+)`, "i");
  const m = texto.match(re);
  return m ? m[1].trim() : null;
}

// Formato argentino: "." separa miles, "," separa decimales.
// Ej: "$147.146,00" → 14714600 (centavos, entero — nunca float para comparar).
export function parseMontoArgentinoACentavos(texto: string): number {
  const limpio = texto.replace(/[^0-9.,]/g, "");
  const sinMiles = limpio.replace(/\./g, "");
  const [enteros, decimales] = sinMiles.split(",");
  const centavosStr = ((decimales ?? "00") + "00").slice(0, 2);
  return Number(enteros || "0") * 100 + Number(centavosStr || "0");
}

// Tiendanube devuelve `total` como string decimal estándar (punto = decimal),
// no en formato argentino — requiere un parseo distinto al del mensaje.
export function parseTotalTnACentavos(total: string): number {
  return Math.round(Number(total) * 100);
}

function parseHoraArgentina(texto: string | null): Date | null {
  if (!texto) return null;
  // "31/08/2026, 19:07:48"
  const m = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

// Devuelve null si el texto no matchea el patrón "NUEVO INGRESO" del bot
// bancario — cualquier otro mensaje del grupo se ignora tal cual.
export function parseMensajeTelegram(texto: string): TransferParsed | null {
  if (!/NUEVO INGRESO/i.test(texto)) return null;

  const montoStr = extraerCampo(texto, "Monto");
  const transactionId = extraerCampo(texto, "ID Transacci[oó]n");
  if (!montoStr || !transactionId) return null;

  const senderName = (extraerCampo(texto, "De") ?? "").trim();
  const cuitCuilRaw = extraerCampo(texto, "CUIT/CUIL");
  const cuitCuil = cuitCuilRaw ? normalizarDni(cuitCuilRaw) : null;
  const bankAccountRaw = extraerCampo(texto, "CBU/CVU");

  return {
    amountCents: parseMontoArgentinoACentavos(montoStr),
    senderName,
    cuitCuil,
    detectedDni: cuitCuil ? extraerDniDeCuit(cuitCuil) : null,
    bankAccount: bankAccountRaw ? normalizarDni(bankAccountRaw) : null,
    transactionId: transactionId.trim(),
    receivedAt: parseHoraArgentina(extraerCampo(texto, "Hora")),
  };
}

// ─── CUIT/CUIL → DNI ─────────────────────────────────────────────────────────

// Algoritmo real de dígito verificador de CUIT/CUIL (módulo 11). Solo se usa
// para VALIDAR, nunca se asume ciegamente que los 8 dígitos del medio son un
// DNI real — si el dígito verificador no cierra, o el prefijo no es de
// persona física, se devuelve null.
const MULTIPLICADORES_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIJOS_PERSONA_FISICA = ["20", "23", "24", "27"];

export function extraerDniDeCuit(cuitCuil: string): string | null {
  const digitos = (cuitCuil ?? "").replace(/[^0-9]/g, "");
  if (digitos.length !== 11) return null;

  const prefijo = digitos.slice(0, 2);
  if (!PREFIJOS_PERSONA_FISICA.includes(prefijo)) return null;

  const primeros10 = digitos.slice(0, 10).split("").map(Number);
  const verificadorReal = Number(digitos[10]);
  const suma = primeros10.reduce((acc, d, i) => acc + d * MULTIPLICADORES_CUIT[i], 0);
  let verificadorCalculado = 11 - (suma % 11);
  if (verificadorCalculado === 11) verificadorCalculado = 0;
  if (verificadorCalculado === 10) return null; // caso no estándar — no confiar

  if (verificadorCalculado !== verificadorReal) return null;
  return digitos.slice(2, 10);
}

// ─── Normalización ───────────────────────────────────────────────────────────

export function normalizarDni(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.replace(/[^0-9]/g, "");
  return limpio || null;
}

export function normalizarNombre(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nombresCoinciden(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizarNombre(a) === normalizarNombre(b);
}

// ─── Motor de conciliación ───────────────────────────────────────────────────

export function evaluarCandidato(
  order: OrderCandidate, transfer: TransferParsed, toleranciaCents: number,
): CandidateMatch {
  const matchAmount = Math.abs(order.totalCents - transfer.amountCents) <= toleranciaCents;
  const dniOrder = normalizarDni(order.contactDni);
  const matchDni = !!dniOrder && !!transfer.detectedDni && dniOrder === transfer.detectedDni;
  const matchName = nombresCoinciden(order.contactName, transfer.senderName);
  return { candidate: order, matchDni, matchAmount, matchName, matchMethod: order.isTransferGateway };
}

// Reglas determinísticas — nunca se acredita solo por monto sin DNI exacto.
// NIVEL A (AUTO_MATCHED): exactamente un candidato con DNI + monto + método
// ok. NIVEL B (REQUIRES_REVIEW): cualquier ambigüedad (DNI sin monto, monto
// sin DNI, DNI ausente, más de un candidato). NIVEL C (UNMATCHED): ningún
// candidato con ninguna señal fuerte.
export function decidirNivel(evaluaciones: CandidateMatch[]): DecisionResultado {
  const validosMetodo = evaluaciones.filter(e => e.matchMethod);
  const conDniYMonto = validosMetodo.filter(e => e.matchDni && e.matchAmount);

  if (conDniYMonto.length === 1) {
    return { nivel: "AUTO_MATCHED", seleccionado: conDniYMonto[0], candidatos: evaluaciones };
  }
  if (conDniYMonto.length > 1) {
    return { nivel: "REQUIRES_REVIEW", seleccionado: null, candidatos: conDniYMonto };
  }
  const algunaSenal = validosMetodo.filter(e => e.matchDni || e.matchAmount);
  if (algunaSenal.length > 0) {
    return { nivel: "REQUIRES_REVIEW", seleccionado: null, candidatos: algunaSenal };
  }
  return { nivel: "UNMATCHED", seleccionado: null, candidatos: [] };
}
