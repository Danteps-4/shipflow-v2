/**
 * Multi-store token management, compartido por todo el equipo.
 * Un solo archivo stores.json para todo el negocio (no por login),
 * para que cualquier persona del equipo vea las mismas tiendas conectadas.
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
  active: number | null;
  stores: Record<string, StoreInfo>;
}

// ── Internal helpers ──────────────────────────────────────────────

function readRaw(): StoresFile {
  if (!fs.existsSync(STORES_FILE)) return { active: null, stores: {} };
  try {
    return JSON.parse(fs.readFileSync(STORES_FILE, "utf-8")) as StoresFile;
  } catch (e) {
    console.log("[tnStores] readRaw error:", e);
    return { active: null, stores: {} };
  }
}

function writeRaw(data: StoresFile): void {
  fs.writeFileSync(STORES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────

export function listStores(): StoreInfo[] {
  return Object.values(readRaw().stores);
}

export function getActiveStore(): StoreInfo | null {
  const { active, stores } = readRaw();
  if (!active) return null;
  return stores[String(active)] ?? null;
}

export function getStoresState(): { active: number | null; stores: StoreInfo[] } {
  const data = readRaw();
  return { active: data.active, stores: Object.values(data.stores) };
}

export function addStore(info: StoreInfo): void {
  const data = readRaw();
  data.stores[String(info.user_id)] = info;
  data.active = info.user_id;
  writeRaw(data);
}

export function switchStore(storeId: number): boolean {
  const data = readRaw();
  if (!data.stores[String(storeId)]) return false;
  data.active = storeId;
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
  writeRaw(data);
}
