import fs from "fs";
import path from "path";
import { DATA_DIR } from "./dataDir";
import { ALL_MODULES, ModuleKey } from "./modules";
import { LinkAction } from "./navGroups";

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
  // undefined = sin restricciones puntuales (todo lo del módulo permitido).
  // Definido = lista exacta de sub apartados (hrefs) permitidos.
  linkAccess?: string[];
  // Acciones de escritura (agregar/editar/eliminar) permitidas por sub
  // apartado, hoy solo aplicable a los tabs de Creativo que son biblioteca
  // de entradas. Sin entrada para un href = sin restricción (puede las 3).
  linkActions?: Record<string, LinkAction[]>;
  // Capacidad de supervisión dentro de Tickets (cerrar, reasignar, salir de
  // "pendiente supervisión", borrar costos/adjuntos). A diferencia de
  // linkAccess/linkActions, arranca en `false`/undefined = SIN supervisión
  // — es una capacidad nueva, nadie la tuvo antes, así que no debe heredar
  // el criterio "undefined = permitido" del resto de los permisos.
  ticketsPuedeSupervisar?: boolean;
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
  access: {
    role: UserRole; modules: ModuleKey[]; linkAccess?: string[]; linkActions?: Record<string, LinkAction[]>;
    ticketsPuedeSupervisar?: boolean;
  }
): User | null {
  const users = readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  user.role = access.role;
  user.modules = access.modules;
  user.linkAccess = access.linkAccess;
  user.linkActions = access.linkActions;
  user.ticketsPuedeSupervisar = access.ticketsPuedeSupervisar;
  writeUsers(users);
  return user;
}
