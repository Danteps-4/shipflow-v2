import fs from "fs";
import path from "path";
import { DATA_DIR } from "./dataDir";
import { ALL_MODULES, ModuleKey } from "./modules";

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, "users.json");

export type UserRole = "admin" | "member";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  role: UserRole;
  modules: ModuleKey[];
}

// Usuarios creados antes de que existiera role/modules no tienen esos campos
// en el JSON. Se autocompletan como admin + todos los módulos (el acceso
// total que ya tenían de hecho) la primera vez que se leen, y se persiste
// para no repetir el chequeo en cada request.
function migrateLegacyUsers(users: User[]): User[] {
  let changed = false;
  const migrated = users.map((u) => {
    if (u.role !== undefined && u.modules !== undefined) return u;
    changed = true;
    return { ...u, role: u.role ?? "admin", modules: u.modules ?? [...ALL_MODULES] };
  });
  if (changed) writeUsers(migrated);
  return migrated;
}

function readUsers(): User[] {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) as User[];
    return migrateLegacyUsers(raw);
  } catch {
    return [];
  }
}

function writeUsers(users: User[]): void {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export function findUserByEmail(email: string): User | null {
  return readUsers().find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function findUserById(id: string): User | null {
  return readUsers().find((u) => u.id === id) ?? null;
}

export function listUsers(): User[] {
  return readUsers();
}

// Nuevos registros arrancan sin ningún módulo asignado: un admin les otorga
// acceso desde /equipo después de darlos de alta.
export function createUser(data: { name: string; email: string; passwordHash: string }): User {
  const users = readUsers();
  const user: User = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    role: "member",
    modules: [],
  };
  users.push(user);
  writeUsers(users);
  return user;
}

export function updateUserAccess(
  id: string,
  access: { role: UserRole; modules: ModuleKey[] }
): User | null {
  const users = readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  user.role = access.role;
  user.modules = access.modules;
  writeUsers(users);
  return user;
}
