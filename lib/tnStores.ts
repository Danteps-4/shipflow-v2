/**
 * Per-user multi-store token management.
 * Each ShipFlow user gets their own stores_{sfUserId}.json file.
 */
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./dataDir";

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

function storesFilePath(sfUserId: string): string {
  return path.join(DATA_DIR, `stores_${sfUserId}.json`);
}

function readRaw(sfUserId: string): StoresFile {
  const file = storesFilePath(sfUserId);
  if (!fs.existsSync(file)) return { active: null, stores: {} };
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as StoresFile;
  } catch {
    return { active: null, stores: {} };
  }
}

function writeRaw(sfUserId: string, data: StoresFile): void {
  fs.writeFileSync(storesFilePath(sfUserId), JSON.stringify(data, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────

export function listStores(sfUserId: string): StoreInfo[] {
  return Object.values(readRaw(sfUserId).stores);
}

export function getActiveStore(sfUserId: string): StoreInfo | null {
  const { active, stores } = readRaw(sfUserId);
  if (!active) return null;
  return stores[String(active)] ?? null;
}

export function getStoresState(sfUserId: string): { active: number | null; stores: StoreInfo[] } {
  const data = readRaw(sfUserId);
  return { active: data.active, stores: Object.values(data.stores) };
}

export function addStore(sfUserId: string, info: StoreInfo): void {
  const data = readRaw(sfUserId);
  data.stores[String(info.user_id)] = info;
  data.active = info.user_id;
  writeRaw(sfUserId, data);
}

export function switchStore(sfUserId: string, storeId: number): boolean {
  const data = readRaw(sfUserId);
  if (!data.stores[String(storeId)]) return false;
  data.active = storeId;
  writeRaw(sfUserId, data);
  return true;
}

export function disconnectStore(sfUserId: string, storeId: number): void {
  const data = readRaw(sfUserId);
  delete data.stores[String(storeId)];
  if (data.active === storeId) {
    const remaining = Object.keys(data.stores);
    data.active = remaining.length ? parseInt(remaining[0]) : null;
  }
  writeRaw(sfUserId, data);
}
