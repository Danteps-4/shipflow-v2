// Verificación manual de lib/conciliacionMatching.ts — no hay framework de
// tests en el repo, así que esto es un script chico corrido con `npx tsx`.
// Cubre los casos de la spec de Conciliación de Transferencias.
import assert from "node:assert/strict";
import {
  parseMensajeTelegram, parseMontoArgentinoACentavos, parseTotalTnACentavos,
  extraerDniDeCuit, normalizarDni, nombresCoinciden,
  evaluarCandidato, decidirNivel, OrderCandidate, TransferParsed,
} from "../lib/conciliacionMatching";

let ok = 0;
function caso(nombre: string, fn: () => void) {
  try {
    fn();
    ok++;
    console.log(`OK   - ${nombre}`);
  } catch (e) {
    console.error(`FAIL - ${nombre}`);
    console.error(e);
    process.exitCode = 1;
  }
}

const MENSAJE_REAL = `✅ ¡NUEVO INGRESO! ✅

💰 Monto: $147.146,00
👤 De: MAURO DANIEL PAZ
📄 CUIT/CUIL: 23306842269
🏦 CBU/CVU: 4530000800013581643270
🆔 ID Transacción: cd76bdf3-1b9b-4da7-992c-8007af74b1ba
🕐 Hora: 31/08/2026, 19:07:48`;

const TOLERANCIA = 100; // $1

function pedido(overrides: Partial<OrderCandidate> = {}): OrderCandidate {
  return {
    storeId: "1000", orderId: "1", orderNumber: "7058", contactName: "Mauro daniel Paz",
    contactDni: "30.684.226", totalCents: 14714550, isTransferGateway: true,
    ...overrides,
  };
}

// ─── Parseo ──────────────────────────────────────────────────────────────────

caso("parseMontoArgentinoACentavos: $147.146,00 -> 14714600", () => {
  assert.equal(parseMontoArgentinoACentavos("$147.146,00"), 14714600);
});

caso("parseTotalTnACentavos: '147145.50' -> 14714550", () => {
  assert.equal(parseTotalTnACentavos("147145.50"), 14714550);
});

caso("extraerDniDeCuit: CUIL real del usuario -> DNI correcto", () => {
  assert.equal(extraerDniDeCuit("23306842269"), "30684226");
});

caso("extraerDniDeCuit: CUIT de empresa (prefijo 30) -> null", () => {
  assert.equal(extraerDniDeCuit("30712345678"), null);
});

caso("extraerDniDeCuit: dígito verificador inválido -> null", () => {
  assert.equal(extraerDniDeCuit("23306842260"), null);
});

caso("normalizarDni: '30.684.226' -> '30684226'", () => {
  assert.equal(normalizarDni("30.684.226"), "30684226");
});

caso("nombresCoinciden: mayúsculas/minúsculas distintas -> true", () => {
  assert.equal(nombresCoinciden("MAURO DANIEL PAZ", "Mauro daniel Paz"), true);
});

caso("parseMensajeTelegram: mensaje real completo", () => {
  const t = parseMensajeTelegram(MENSAJE_REAL) as TransferParsed;
  assert.ok(t);
  assert.equal(t.amountCents, 14714600);
  assert.equal(t.senderName, "MAURO DANIEL PAZ");
  assert.equal(t.cuitCuil, "23306842269");
  assert.equal(t.detectedDni, "30684226");
  assert.equal(t.bankAccount, "4530000800013581643270");
  assert.equal(t.transactionId, "cd76bdf3-1b9b-4da7-992c-8007af74b1ba");
});

caso("parseMensajeTelegram: mensaje sin 'NUEVO INGRESO' -> null", () => {
  assert.equal(parseMensajeTelegram("Hola, cómo estás?"), null);
});

// ─── Motor de conciliación (los 12 casos de la spec) ────────────────────────

caso("Caso 1 (real): CUIL 23306842269, diferencia $0,50 -> AUTO_MATCHED", () => {
  const transfer = parseMensajeTelegram(MENSAJE_REAL) as TransferParsed;
  const ev = evaluarCandidato(pedido(), transfer, TOLERANCIA);
  const r = decidirNivel([ev]);
  assert.equal(r.nivel, "AUTO_MATCHED");
  assert.equal(r.seleccionado?.candidate.orderNumber, "7058");
});

caso("Caso 2: DNI exacto + monto exacto -> AUTO_MATCHED", () => {
  const transfer: TransferParsed = {
    amountCents: 14714550, senderName: "Mauro Daniel Paz", cuitCuil: "23306842269",
    detectedDni: "30684226", bankAccount: null, transactionId: "t2", receivedAt: null,
  };
  const r = decidirNivel([evaluarCandidato(pedido(), transfer, TOLERANCIA)]);
  assert.equal(r.nivel, "AUTO_MATCHED");
});

caso("Caso 3: DNI exacto + diferencia $0,50 (dentro de tolerancia) -> AUTO_MATCHED", () => {
  const transfer: TransferParsed = {
    amountCents: 14714600, senderName: "Mauro Daniel Paz", cuitCuil: "23306842269",
    detectedDni: "30684226", bankAccount: null, transactionId: "t3", receivedAt: null,
  };
  const r = decidirNivel([evaluarCandidato(pedido({ totalCents: 14714550 }), transfer, TOLERANCIA)]);
  assert.equal(r.nivel, "AUTO_MATCHED");
});

caso("Caso 4: DNI exacto + diferencia $50 (fuera de tolerancia) -> REQUIRES_REVIEW", () => {
  const transfer: TransferParsed = {
    amountCents: 14714550 + 5000, senderName: "Mauro Daniel Paz", cuitCuil: "23306842269",
    detectedDni: "30684226", bankAccount: null, transactionId: "t4", receivedAt: null,
  };
  const r = decidirNivel([evaluarCandidato(pedido(), transfer, TOLERANCIA)]);
  assert.equal(r.nivel, "REQUIRES_REVIEW");
});

caso("Caso 5: monto exacto + DNI diferente -> REQUIRES_REVIEW", () => {
  const transfer: TransferParsed = {
    amountCents: 14714550, senderName: "Otra Persona", cuitCuil: "20111111112",
    detectedDni: "11111111", bankAccount: null, transactionId: "t5", receivedAt: null,
  };
  const r = decidirNivel([evaluarCandidato(pedido(), transfer, TOLERANCIA)]);
  assert.equal(r.nivel, "REQUIRES_REVIEW");
});

caso("Caso 6: monto exacto + DNI inexistente (no se pudo extraer) -> REQUIRES_REVIEW", () => {
  const transfer: TransferParsed = {
    amountCents: 14714550, senderName: "Mauro Daniel Paz", cuitCuil: null,
    detectedDni: null, bankAccount: null, transactionId: "t6", receivedAt: null,
  };
  const r = decidirNivel([evaluarCandidato(pedido(), transfer, TOLERANCIA)]);
  assert.equal(r.nivel, "REQUIRES_REVIEW");
});

caso("Caso 7: dos pedidos con mismo DNI y monto -> REQUIRES_REVIEW", () => {
  const transfer: TransferParsed = {
    amountCents: 14714550, senderName: "Mauro Daniel Paz", cuitCuil: "23306842269",
    detectedDni: "30684226", bankAccount: null, transactionId: "t7", receivedAt: null,
  };
  const p1 = pedido({ orderId: "1", orderNumber: "7058" });
  const p2 = pedido({ orderId: "2", orderNumber: "7099" });
  const r = decidirNivel([
    evaluarCandidato(p1, transfer, TOLERANCIA),
    evaluarCandidato(p2, transfer, TOLERANCIA),
  ]);
  assert.equal(r.nivel, "REQUIRES_REVIEW");
});

caso("Caso 9: pedido ya pagado no entra como candidato (se filtra antes del motor)", () => {
  // buscarCandidatos solo trae payment_status=pending — un pedido pagado
  // nunca llega a evaluarCandidato/decidirNivel, así que con lista vacía
  // el resultado es UNMATCHED (no se toca nada).
  const r = decidirNivel([]);
  assert.equal(r.nivel, "UNMATCHED");
});

caso("Caso: método de pago no es transferencia -> REQUIRES_REVIEW (no AUTO_MATCHED)", () => {
  const transfer: TransferParsed = {
    amountCents: 14714550, senderName: "Mauro Daniel Paz", cuitCuil: "23306842269",
    detectedDni: "30684226", bankAccount: null, transactionId: "t8", receivedAt: null,
  };
  const r = decidirNivel([evaluarCandidato(pedido({ isTransferGateway: false }), transfer, TOLERANCIA)]);
  assert.notEqual(r.nivel, "AUTO_MATCHED");
});

caso("Nunca se acredita solo por monto sin DNI exacto", () => {
  const transfer: TransferParsed = {
    amountCents: 14714550, senderName: "Nombre Cualquiera", cuitCuil: null,
    detectedDni: null, bankAccount: null, transactionId: "t9", receivedAt: null,
  };
  const r = decidirNivel([evaluarCandidato(pedido({ contactDni: null }), transfer, TOLERANCIA)]);
  assert.notEqual(r.nivel, "AUTO_MATCHED");
});

console.log(`\n${ok} casos OK` + (process.exitCode ? " — HAY FALLAS" : ""));
