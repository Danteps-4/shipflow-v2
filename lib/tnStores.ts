/**
 * Multi-store token management, compartido por todo el equipo: un solo
 * archivo stores.json con todas las tiendas conectadas (para no tener que
 * reautorizar por cada persona), pero cada usuario logueado tiene su
 * propio puntero de "tienda activa" (activeByUser), para que cambiar de
 * tienda o recargar la página no le pise la sesión a otra persona que esté
 * trabajando con otra tienda al mismo tiempo.
 */
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./dataDir";

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const STORES_FILE = path.join(DATA_DIR, "stores.json");

export interface StoreInfo {
  access_token: string;
  user_id: number;
  store_name: string;
  connected_at: string;
}

export interface StoresFile {
  active: number | null;              // default para sesiones que todavía no eligieron tienda propia
  activeByUser: Record<string, number>; // sfUserId -> tienda activa de ESE usuario
  stores: Record<string, StoreInfo>;
}

// ── Internal helpers ──────────────────────────────────────────────

function readRaw(): StoresFile {
  if (!fs.existsSync(STORES_FILE)) return { active: null, activeByUser: {}, stores: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(STORES_FILE, "utf-8")) as Partial<StoresFile>;
    return { active: parsed.active ?? null, activeByUser: parsed.activeByUser ?? {}, stores: parsed.stores ?? {} };
  } catch (e) {
    console.log("[tnStores] readRaw error:", e);
    return { active: null, activeByUser: {}, stores: {} };
  }
}

function writeRaw(data: StoresFile): void {
  fs.writeFileSync(STORES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────

export function listStores(): StoreInfo[] {
  return Object.values(readRaw().stores);
}

// sfUserId null (ej. contexto sin sesión) cae directo al default global.
export function getActiveStoreForUser(sfUserId: string | null): StoreInfo | null {
  const { active, activeByUser, stores } = readRaw();
  const storeId = (sfUserId && activeByUser[sfUserId]) || active;
  if (!storeId) return null;
  return stores[String(storeId)] ?? null;
}

export function getStoresStateForUser(sfUserId: string | null): { active: number | null; stores: StoreInfo[] } {
  const { active, activeByUser, stores } = readRaw();
  const effectiveActive = (sfUserId && activeByUser[sfUserId]) || active;
  return { active: effectiveActive, stores: Object.values(stores) };
}

// sfUserId opcional: al conectar una tienda nueva sin sesión (no debería
// pasar en la práctica, todas las rutas que llaman a esto ya están
// autenticadas) sólo se actualiza el default global.
export function addStore(info: StoreInfo, sfUserId?: string | null): void {
  const data = readRaw();
  data.stores[String(info.user_id)] = info;
  data.active = info.user_id;
  if (sfUserId) data.activeByUser[sfUserId] = info.user_id;
  writeRaw(data);
}

export function switchStoreForUser(sfUserId: string, storeId: number): boolean {
  const data = readRaw();
  if (!data.stores[String(storeId)]) return false;
  data.activeByUser[sfUserId] = storeId;
  writeRaw(data);
  return true;
}

export function disconnectStore(storeId: number): void {
  const data = readRaw();
  delete data.stores[String(storeId)];
  if (data.active === storeId) {
    const remaining = Object.keys(data.stores);
    data.active = remaining.length ? parseInt(remaining[0]) : null;
  }
  // Cualquier usuario que tuviera esta tienda como su activa personal
  // vuelve a caer en el default global (arriba).
  for (const uid of Object.keys(data.activeByUser)) {
    if (data.activeByUser[uid] === storeId) delete data.activeByUser[uid];
  }
  writeRaw(data);
}
